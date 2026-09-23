#import <Foundation/Foundation.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <limits>
#include <map>
#include <numeric>
#include <string>
#include <vector>

#include "anchor-color-classification-provider.hpp"
#include "yolox-native-ffmpeg-decoder.hpp"

namespace {

struct Observation {
  long long atMs;
  double left;
  double top;
  double width;
  double height;
};

struct Trajectory {
  NSString* identifier;
  NSString* entityType;
  std::vector<Observation> observations;
};

struct Feature {
  std::vector<double> values;
  int frameCount = 0;
  long long pixelCount = 0;
};

struct Configuration {
  int tensorSize;
  int hueBins;
  int achromaticBins;
  int saturationBins;
  double torsoLeft;
  double torsoTop;
  double torsoRight;
  double torsoBottom;
  int pixelStride;
  int minimumPixelCount;
  double chromaticSaturationMinimum;
  double grassHueMinimum;
  double grassHueMaximum;
  double maximumCosineDistance;
  double minimumDistanceMargin;
  double minimumConfidence;
  int maximumFramesPerTrajectory;
};

Configuration LoadConfiguration(NSDictionary* specification) {
  NSDictionary* feature = specification[@"feature"];
  NSDictionary* decision = specification[@"decision"];
  Configuration value{
    [feature[@"tensorSize"] intValue], [feature[@"hueBins"] intValue],
    [feature[@"achromaticBins"] intValue], [feature[@"saturationBins"] intValue],
    [feature[@"torsoLeftRatio"] doubleValue], [feature[@"torsoTopRatio"] doubleValue],
    [feature[@"torsoRightRatio"] doubleValue], [feature[@"torsoBottomRatio"] doubleValue],
    [feature[@"pixelStride"] intValue], [feature[@"minimumPixelCount"] intValue],
    [feature[@"chromaticSaturationMinimum"] doubleValue],
    [feature[@"grassHueMinimumDegrees"] doubleValue],
    [feature[@"grassHueMaximumDegrees"] doubleValue],
    [decision[@"maximumCosineDistance"] doubleValue],
    [decision[@"minimumDistanceMargin"] doubleValue],
    [decision[@"minimumConfidence"] doubleValue],
    [decision[@"maximumFramesPerTrajectory"] intValue],
  };
  if (value.tensorSize != 640 || value.hueBins != 12 || value.achromaticBins != 3 ||
      value.saturationBins != 3 || value.torsoLeft < 0 || value.torsoTop < 0 ||
      value.torsoRight <= value.torsoLeft || value.torsoRight > 1 ||
      value.torsoBottom <= value.torsoTop || value.torsoBottom > 1 ||
      value.pixelStride < 1 || value.pixelStride > 16 || value.minimumPixelCount < 16 ||
      value.chromaticSaturationMinimum < 0 || value.chromaticSaturationMinimum > 1 ||
      value.grassHueMinimum < 0 || value.grassHueMaximum > 360 ||
      value.grassHueMaximum <= value.grassHueMinimum || value.maximumCosineDistance <= 0 ||
      value.maximumCosineDistance > 2 || value.minimumDistanceMargin < 0 ||
      value.minimumDistanceMargin > 1 || value.minimumConfidence < 0.5 ||
      value.minimumConfidence > 1 || value.maximumFramesPerTrajectory < 1 ||
      value.maximumFramesPerTrajectory > 100) FSAnchorColorFail("specification-values-invalid");
  if (![decision[@"requirePlayerAndRefereeAnchors"] isEqual:@YES] ||
      ![decision[@"requireHomeAndAwayAnchors"] isEqual:@YES]) {
    FSAnchorColorFail("specification-anchor-policy-invalid");
  }
  return value;
}

std::vector<Trajectory> LoadTrajectories(NSArray* values) {
  std::vector<Trajectory> result;
  result.reserve(values.count);
  for (NSDictionary* value in values) {
    Trajectory trajectory{value[@"id"], value[@"entityType"], {}};
    for (NSDictionary* raw in value[@"observations"]) {
      NSDictionary* box = raw[@"box"];
      trajectory.observations.push_back(Observation{
        [raw[@"atMs"] longLongValue], [box[@"left"] doubleValue], [box[@"top"] doubleValue],
        [box[@"width"] doubleValue], [box[@"height"] doubleValue],
      });
    }
    result.push_back(std::move(trajectory));
  }
  return result;
}

const Observation* NearestObservation(const Trajectory& trajectory, long long atMs, double toleranceMs) {
  if (trajectory.observations.empty()) return nullptr;
  auto next = std::lower_bound(
      trajectory.observations.begin(), trajectory.observations.end(), atMs,
      [](const Observation& value, long long target) { return value.atMs < target; });
  const Observation* nearest = next == trajectory.observations.end() ? &trajectory.observations.back() : &*next;
  if (next != trajectory.observations.begin()) {
    const Observation* previous = &*(next - 1);
    if (std::llabs(previous->atMs - atMs) <= std::llabs(nearest->atMs - atMs)) nearest = previous;
  }
  return std::llabs(nearest->atMs - atMs) <= toleranceMs ? nearest : nullptr;
}

void RgbToHsv(double red, double green, double blue, double* hue, double* saturation, double* value) {
  const double maximum = std::max({red, green, blue});
  const double minimum = std::min({red, green, blue});
  const double delta = maximum - minimum;
  *value = maximum;
  *saturation = maximum <= 0 ? 0 : delta / maximum;
  if (delta <= 1e-9) *hue = 0;
  else if (maximum == red) *hue = 60 * std::fmod((green - blue) / delta, 6.0);
  else if (maximum == green) *hue = 60 * (((blue - red) / delta) + 2);
  else *hue = 60 * (((red - green) / delta) + 4);
  if (*hue < 0) *hue += 360;
}

bool Normalize(std::vector<double>* values) {
  const double magnitude = std::sqrt(std::inner_product(
      values->begin(), values->end(), values->begin(), 0.0));
  if (!std::isfinite(magnitude) || magnitude <= 1e-9) return false;
  for (double& value : *values) value /= magnitude;
  return true;
}

bool AddFrameFeature(
    const FSDecodedFrame& frame,
    const Observation& box,
    const Configuration& configuration,
    Feature* target) {
  const int size = configuration.tensorSize;
  if (frame.tensor.size() != static_cast<std::size_t>(3 * size * size) || frame.ratio <= 0) {
    FSAnchorColorFail("decoded-frame-invalid");
  }
  const double scaleX = frame.width * frame.ratio;
  const double scaleY = frame.height * frame.ratio;
  const int x0 = std::clamp(static_cast<int>((box.left + box.width * configuration.torsoLeft) * scaleX), 0, size - 1);
  const int x1 = std::clamp(static_cast<int>((box.left + box.width * configuration.torsoRight) * scaleX), x0 + 1, size);
  const int y0 = std::clamp(static_cast<int>((box.top + box.height * configuration.torsoTop) * scaleY), 0, size - 1);
  const int y1 = std::clamp(static_cast<int>((box.top + box.height * configuration.torsoBottom) * scaleY), y0 + 1, size);
  std::vector<double> values(
      configuration.hueBins + configuration.achromaticBins + configuration.saturationBins, 0);
  const std::size_t plane = static_cast<std::size_t>(size) * size;
  long long pixels = 0;
  for (int y = y0; y < y1; y += configuration.pixelStride) {
    for (int x = x0; x < x1; x += configuration.pixelStride) {
      const std::size_t offset = static_cast<std::size_t>(y) * size + x;
      double hue = 0;
      double saturation = 0;
      double brightness = 0;
      RgbToHsv(
          frame.tensor[plane * 2 + offset] / 255.0,
          frame.tensor[plane + offset] / 255.0,
          frame.tensor[offset] / 255.0,
          &hue, &saturation, &brightness);
      if (saturation >= configuration.chromaticSaturationMinimum &&
          hue >= configuration.grassHueMinimum && hue <= configuration.grassHueMaximum) continue;
      if (saturation >= configuration.chromaticSaturationMinimum) {
        const int bin = std::min(configuration.hueBins - 1,
                                 static_cast<int>(hue / 360.0 * configuration.hueBins));
        values[bin] += 0.5 + saturation;
      } else {
        const int bin = std::min(configuration.achromaticBins - 1,
            static_cast<int>(brightness * configuration.achromaticBins));
        values[configuration.hueBins + bin] += 1;
      }
      const int saturationBin = std::min(configuration.saturationBins - 1,
          static_cast<int>(saturation * configuration.saturationBins));
      values[configuration.hueBins + configuration.achromaticBins + saturationBin] += 0.5;
      pixels += 1;
    }
  }
  if (pixels < configuration.minimumPixelCount || !Normalize(&values)) return false;
  if (target->values.empty()) target->values.assign(values.size(), 0);
  for (std::size_t index = 0; index < values.size(); index += 1) target->values[index] += values[index];
  target->frameCount += 1;
  target->pixelCount += pixels;
  return true;
}

std::vector<Feature> ExtractFeatures(
    const FSAnchorColorInvocation& invocation,
    const std::vector<Trajectory>& trajectories,
    const Configuration& configuration) {
  std::vector<Feature> features(trajectories.size());
  const double toleranceMs = std::max(100.0, 750.0 / invocation.sampleFps);
  NSDictionary* range = invocation.request[@"range"];
  FSDecodeSampledH264Frames(
      invocation.sourcePath.UTF8String, [range[@"startMs"] longLongValue],
      [range[@"endMs"] longLongValue], invocation.sampleFps, invocation.decoderThreads,
      invocation.maximumFrames, [&](FSDecodedFrame&& frame) {
        for (std::size_t index = 0; index < trajectories.size(); index += 1) {
          Feature& feature = features[index];
          if (feature.frameCount >= configuration.maximumFramesPerTrajectory) continue;
          const Observation* observation = NearestObservation(trajectories[index], frame.atMs, toleranceMs);
          if (observation) AddFrameFeature(frame, *observation, configuration, &feature);
        }
      });
  for (Feature& feature : features) {
    if (feature.frameCount > 0) Normalize(&feature.values);
  }
  return features;
}

using AnchorMap = std::map<std::string, std::string>;

AnchorMap LoadAnchors(NSArray* values, NSString* labelKey) {
  AnchorMap result;
  for (NSDictionary* value in values) {
    result[[value[@"trajectoryId"] UTF8String]] = [value[labelKey] UTF8String];
  }
  return result;
}

std::vector<double> Prototype(
    const std::string& label,
    const AnchorMap& anchors,
    const std::vector<Trajectory>& trajectories,
    const std::vector<Feature>& features) {
  std::vector<double> result;
  int count = 0;
  for (std::size_t index = 0; index < trajectories.size(); index += 1) {
    const auto match = anchors.find(trajectories[index].identifier.UTF8String);
    if (match == anchors.end() || match->second != label || features[index].frameCount < 1) continue;
    if (result.empty()) result.assign(features[index].values.size(), 0);
    for (std::size_t offset = 0; offset < result.size(); offset += 1) {
      result[offset] += features[index].values[offset];
    }
    count += 1;
  }
  if (count > 0) Normalize(&result);
  return result;
}

double CosineDistance(const std::vector<double>& left, const std::vector<double>& right) {
  if (left.empty() || left.size() != right.size()) return std::numeric_limits<double>::infinity();
  return 1 - std::clamp(std::inner_product(left.begin(), left.end(), right.begin(), 0.0), -1.0, 1.0);
}

struct Decision {
  std::string label = "unknown";
  double confidence = 0;
};

Decision Classify(
    const Feature& feature,
    const std::vector<double>& first,
    const std::string& firstLabel,
    const std::vector<double>& second,
    const std::string& secondLabel,
    const Configuration& configuration) {
  if (feature.frameCount < 1 || first.empty() || second.empty()) return {};
  const double firstDistance = CosineDistance(feature.values, first);
  const double secondDistance = CosineDistance(feature.values, second);
  const bool firstWins = firstDistance <= secondDistance;
  const double best = firstWins ? firstDistance : secondDistance;
  const double other = firstWins ? secondDistance : firstDistance;
  const double margin = other - best;
  const double confidence = other + best > 1e-9 ? other / (other + best) : 0.5;
  if (best > configuration.maximumCosineDistance || margin < configuration.minimumDistanceMargin ||
      confidence < configuration.minimumConfidence) return {};
  return {firstWins ? firstLabel : secondLabel, std::clamp(confidence, 0.0, 1.0)};
}

}  // namespace

[[noreturn]] void FSProviderFail(const std::string& message) {
  FSAnchorColorFail(message);
}

NSArray<NSDictionary*>* FSRunAnchorColorClassification(const FSAnchorColorInvocation& invocation) {
  const Configuration configuration = LoadConfiguration(invocation.specification);
  const std::vector<Trajectory> trajectories = LoadTrajectories(invocation.request[@"trajectories"]);
  const std::vector<Feature> features = ExtractFeatures(invocation, trajectories, configuration);
  const AnchorMap roleAnchors = LoadAnchors(invocation.request[@"roleAnchors"], @"role");
  const AnchorMap teamAnchors = LoadAnchors(invocation.request[@"teamAnchors"], @"teamSide");
  const std::vector<double> playerPrototype = Prototype("player", roleAnchors, trajectories, features);
  const std::vector<double> refereePrototype = Prototype("referee", roleAnchors, trajectories, features);
  const std::vector<double> homePrototype = Prototype("home", teamAnchors, trajectories, features);
  const std::vector<double> awayPrototype = Prototype("away", teamAnchors, trajectories, features);
  NSMutableArray<NSDictionary*>* result = [NSMutableArray array];
  for (std::size_t index = 0; index < trajectories.size(); index += 1) {
    const Trajectory& trajectory = trajectories[index];
    if (![trajectory.entityType isEqual:@"person"] && ![trajectory.entityType isEqual:@"player"]) continue;
    const std::string identifier = trajectory.identifier.UTF8String;
    Decision role;
    const auto anchoredRole = roleAnchors.find(identifier);
    if (anchoredRole != roleAnchors.end()) role = {anchoredRole->second, 1};
    else role = Classify(features[index], playerPrototype, "player", refereePrototype, "referee", configuration);
    NSMutableDictionary* classification = [@{
      @"trajectoryId": trajectory.identifier,
      @"role": [NSString stringWithUTF8String:role.label.c_str()],
      @"roleConfidence": @(role.confidence),
    } mutableCopy];
    if (role.label == "player") {
      Decision team;
      const auto anchoredTeam = teamAnchors.find(identifier);
      if (anchoredTeam != teamAnchors.end()) team = {anchoredTeam->second, 1};
      else team = Classify(features[index], homePrototype, "home", awayPrototype, "away", configuration);
      classification[@"teamSide"] = [NSString stringWithUTF8String:team.label.c_str()];
      classification[@"teamConfidence"] = @(team.confidence);
    }
    [result addObject:classification];
  }
  return result;
}

int main(int argc, char** argv) {
  @autoreleasepool {
    try {
      FSAnchorColorInvocation invocation = FSLoadAnchorColorInvocation(argc, argv);
      FSWriteAnchorColorResult(invocation, FSRunAnchorColorClassification(invocation));
      return 0;
    } catch (const std::exception& error) {
      std::fprintf(stderr, "%s\n", error.what());
      return 1;
    }
  }
}
