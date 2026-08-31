#import <Foundation/Foundation.h>

#include <climits>
#include <map>
#include <set>
#include <stdexcept>
#include <string>

#include "anchor-color-classification-provider.hpp"
#include "tracking-native-stage-json.hpp"

namespace {

using namespace fs_tracking_native;

constexpr std::size_t kMaximumInvocationBytes = 64 * 1024 * 1024;
constexpr std::size_t kMaximumManifestBytes = 2 * 1024 * 1024;
constexpr std::size_t kMaximumModelBytes = 1024 * 1024;
constexpr char kInvocationProtocol[] = "football-science-tracking-stage-invocation-v1";
constexpr char kResultProtocol[] = "football-science-tracking-stage-result-v1";
constexpr char kSpecificationProtocol[] = "football-science-anchor-color-classifier-v1";

void ValidateBox(NSDictionary* box) {
  ExactKeys(box, @[@"left", @"top", @"width", @"height"], "box");
  if (!FiniteNumber(box[@"left"], 0, 1) || !FiniteNumber(box[@"top"], 0, 1) ||
      !FiniteNumber(box[@"width"], 0, 1) || !FiniteNumber(box[@"height"], 0, 1) ||
      [box[@"width"] doubleValue] <= 0 || [box[@"height"] doubleValue] <= 0 ||
      [box[@"left"] doubleValue] + [box[@"width"] doubleValue] > 1 ||
      [box[@"top"] doubleValue] + [box[@"height"] doubleValue] > 1) {
    FSAnchorColorFail("box-invalid");
  }
}

void ValidateObservation(
    NSDictionary* value,
    NSString* entityType,
    long long startMs,
    long long endMs,
    long long maximumFrames,
    std::set<std::string>* observationIds) {
  ExactKeys(value, @[@"id", @"atMs", @"frameIndex", @"entityType", @"box", @"confidence"],
            "observation");
  NSString* identifier = value[@"id"];
  if (!Identifier(identifier) || ![value[@"entityType"] isEqual:entityType] ||
      !observationIds->insert(identifier.UTF8String).second ||
      !IntegerNumber(value[@"atMs"], startMs, endMs) ||
      !IntegerNumber(value[@"frameIndex"], 0, maximumFrames - 1) ||
      !FiniteNumber(value[@"confidence"], 0, 1)) FSAnchorColorFail("observation-invalid");
  ValidateBox(value[@"box"]);
}

using TrajectoryTypes = std::map<std::string, std::string>;

TrajectoryTypes ValidateTrajectories(
    NSArray* trajectories,
    NSDictionary* range,
    long long maximumFrames) {
  if (![trajectories isKindOfClass:NSArray.class] || trajectories.count > 1024) {
    FSAnchorColorFail("trajectories-invalid");
  }
  const long long startMs = [range[@"startMs"] longLongValue];
  const long long endMs = [range[@"endMs"] longLongValue];
  TrajectoryTypes trajectoryTypes;
  std::set<std::string> observationIds;
  for (NSDictionary* trajectory in trajectories) {
    ExactKeys(trajectory, @[@"id", @"entityType", @"observations", @"confidence",
                            @"discontinuitiesMs"], "trajectory");
    NSString* identifier = trajectory[@"id"];
    NSString* entityType = trajectory[@"entityType"];
    if (!Identifier(identifier) ||
        (![entityType isEqual:@"person"] && ![entityType isEqual:@"player"] &&
         ![entityType isEqual:@"ball"] && ![entityType isEqual:@"referee"]) ||
        !trajectoryTypes.emplace(identifier.UTF8String, entityType.UTF8String).second ||
        !FiniteNumber(trajectory[@"confidence"], 0, 1) ||
        ![trajectory[@"observations"] isKindOfClass:NSArray.class] ||
        [trajectory[@"observations"] count] < 1 ||
        ![trajectory[@"discontinuitiesMs"] isKindOfClass:NSArray.class]) {
      FSAnchorColorFail("trajectory-invalid");
    }
    long long previousAtMs = -1;
    long long previousFrame = -1;
    for (NSDictionary* observation in trajectory[@"observations"]) {
      ValidateObservation(observation, entityType, startMs, endMs, maximumFrames, &observationIds);
      const long long atMs = [observation[@"atMs"] longLongValue];
      const long long frameIndex = [observation[@"frameIndex"] longLongValue];
      if (atMs < previousAtMs || (atMs == previousAtMs && frameIndex <= previousFrame)) {
        FSAnchorColorFail("trajectory-order-invalid");
      }
      previousAtMs = atMs;
      previousFrame = frameIndex;
    }
    std::set<long long> discontinuities;
    for (NSNumber* value in trajectory[@"discontinuitiesMs"]) {
      if (!IntegerNumber(value, startMs, endMs) || !discontinuities.insert(value.longLongValue).second) {
        FSAnchorColorFail("trajectory-discontinuity-invalid");
      }
    }
  }
  return trajectoryTypes;
}

void ValidateAnchors(
    NSArray* values,
    const TrajectoryTypes& trajectoryTypes,
    NSString* labelKey,
    NSSet<NSString*>* labels,
    bool teamAnchors) {
  if (![values isKindOfClass:NSArray.class] || values.count > 8) FSAnchorColorFail("anchors-invalid");
  std::set<std::string> assigned;
  NSMutableDictionary<NSString*, NSNumber*>* counts = [NSMutableDictionary dictionary];
  for (NSDictionary* anchor in values) {
    ExactKeys(anchor, @[labelKey, @"trajectoryId"], "anchor");
    NSString* label = anchor[labelKey];
    NSString* trajectoryId = anchor[@"trajectoryId"];
    const auto trajectory = Identifier(trajectoryId)
        ? trajectoryTypes.find(trajectoryId.UTF8String)
        : trajectoryTypes.end();
    const bool person = trajectory != trajectoryTypes.end() &&
        (trajectory->second == "person" || trajectory->second == "player");
    const bool compatible = person && (teamAnchors || trajectory->second != "player" ||
        [label isEqual:@"player"]);
    if (![labels containsObject:label] || !Identifier(trajectoryId) ||
        !compatible ||
        !assigned.insert(trajectoryId.UTF8String).second) FSAnchorColorFail("anchor-invalid");
    const long long count = [counts[label] longLongValue] + 1;
    if (count > 4) FSAnchorColorFail("anchor-limit-exceeded");
    counts[label] = @(count);
  }
}

NSArray<NSString*>* ValidateManifest(NSDictionary* manifest, NSString* executablePath) {
  if (![manifest[@"schemaVersion"] isEqual:@1] ||
      ![manifest[@"protocol"] isEqual:@"football-science-tracking-stage-v1"] ||
      ![manifest[@"stage"] isEqual:@"classification"] ||
      ![manifest[@"approval"][@"status"] isEqual:@"candidate"] ||
      ![manifest[@"approval"][@"networkAtInference"] isEqual:@NO] ||
      ![manifest[@"models"] isKindOfClass:NSArray.class] || [manifest[@"models"] count] != 1) {
    FSAnchorColorFail("manifest-scope-invalid");
  }
  NSArray<NSString*>* capabilities = [manifest[@"capabilities"]
      sortedArrayUsingSelector:@selector(compare:)];
  if (![capabilities isEqual:@[@"classify:role", @"classify:team"]]) {
    FSAnchorColorFail("manifest-capabilities-invalid");
  }
  if (![Sha256File(executablePath, 64 * 1024 * 1024)
      isEqual:manifest[@"runtime"][@"providerSha256"]]) FSAnchorColorFail("runtime-sha256-invalid");
  return capabilities;
}

NSDictionary* ValidateSpecification(NSDictionary* specification) {
  ExactKeys(specification, @[@"schemaVersion", @"protocol", @"feature", @"decision"], "specification");
  if (![specification[@"schemaVersion"] isEqual:@1] ||
      ![specification[@"protocol"] isEqual:@(kSpecificationProtocol)]) {
    FSAnchorColorFail("specification-protocol-invalid");
  }
  ExactKeys(specification[@"feature"], @[
    @"tensorSize", @"hueBins", @"achromaticBins", @"saturationBins",
    @"torsoLeftRatio", @"torsoTopRatio", @"torsoRightRatio", @"torsoBottomRatio",
    @"pixelStride", @"minimumPixelCount", @"chromaticSaturationMinimum",
    @"grassHueMinimumDegrees", @"grassHueMaximumDegrees",
  ], "feature-specification");
  ExactKeys(specification[@"decision"], @[
    @"maximumCosineDistance", @"minimumDistanceMargin", @"minimumConfidence",
    @"maximumFramesPerTrajectory", @"requirePlayerAndRefereeAnchors", @"requireHomeAndAwayAnchors",
  ], "decision-specification");
  return specification;
}

}  // namespace

[[noreturn]] void FSAnchorColorFail(const std::string& message) {
  throw std::runtime_error(message);
}

FSAnchorColorInvocation FSLoadAnchorColorInvocation(int argc, char** argv) {
  using namespace fs_tracking_native;
  if (!std::getenv("FS_TRACKING_NETWORK_DISABLED") ||
      std::strcmp(std::getenv("FS_TRACKING_NETWORK_DISABLED"), "1") != 0) {
    FSAnchorColorFail("network-boundary-missing");
  }
  NSString* invocationPath = nil;
  NSString* outputPath = nil;
  for (int index = 1; index < argc; index += 1) {
    const std::string argument(argv[index]);
    if ((argument == "--fs-tracking-stage-invocation" ||
         argument == "--fs-tracking-stage-output") && index + 1 < argc) {
      NSString* value = [NSString stringWithUTF8String:argv[++index]];
      if (argument == "--fs-tracking-stage-invocation" && !invocationPath) invocationPath = value;
      else if (argument == "--fs-tracking-stage-output" && !outputPath) outputPath = value;
      else FSAnchorColorFail("arguments-invalid");
    } else FSAnchorColorFail("arguments-invalid");
  }
  if (!invocationPath || !outputPath) FSAnchorColorFail("arguments-invalid");

  NSString* executablePath = ExecutablePath();
  NSString* providerDir = [[executablePath stringByDeletingLastPathComponent]
      stringByDeletingLastPathComponent];
  NSDictionary* manifest = LoadJson([providerDir stringByAppendingPathComponent:@"manifest.json"],
                                    kMaximumManifestBytes);
  NSArray<NSString*>* capabilities = ValidateManifest(manifest, executablePath);
  NSDictionary* invocation = LoadJson(invocationPath, kMaximumInvocationBytes);
  ExactKeys(invocation, @[@"schemaVersion", @"protocol", @"provider", @"request",
                          @"requestFingerprint", @"source", @"models", @"output"], "invocation");
  if (![invocation[@"schemaVersion"] isEqual:@1] ||
      ![invocation[@"protocol"] isEqual:@(kInvocationProtocol)] ||
      ![invocation[@"provider"] isEqual:@{
        @"id": manifest[@"providerId"], @"version": manifest[@"providerVersion"],
        @"stage": manifest[@"stage"],
      }]) FSAnchorColorFail("invocation-provider-invalid");
  if (![invocation[@"source"] isKindOfClass:NSDictionary.class] ||
      ![invocation[@"models"] isKindOfClass:NSArray.class] || [invocation[@"models"] count] != 1) {
    FSAnchorColorFail("invocation-artifact-set-invalid");
  }
  NSDictionary* source = invocation[@"source"];
  ExactKeys(source, @[@"filePath", @"sha256"], "source");
  NSDictionary* model = invocation[@"models"][0];
  ExactKeys(model, @[@"id", @"filePath", @"bytes", @"sha256"], "model");
  NSDictionary* manifestModel = manifest[@"models"][0];
  if (![model[@"id"] isEqual:manifestModel[@"id"]] ||
      ![model[@"sha256"] isEqual:manifestModel[@"sha256"]] ||
      ![Sha256File(model[@"filePath"], kMaximumModelBytes) isEqual:model[@"sha256"]]) {
    FSAnchorColorFail("model-invalid");
  }
  NSDictionary* request = invocation[@"request"];
  NSString* requestFingerprint = invocation[@"requestFingerprint"];
  if (!Sha256String(requestFingerprint)) FSAnchorColorFail("request-fingerprint-invalid");
  ExactKeys(request, @[@"sourceFingerprint", @"range", @"trajectories", @"roleAnchors",
                        @"teamAnchors"], "request");
  if (![request[@"sourceFingerprint"] isEqual:source[@"sha256"]]) FSAnchorColorFail("source-invalid");
  NSDictionary* range = request[@"range"];
  ExactKeys(range, @[@"startMs", @"endMs"], "range");
  const long long startMs = [range[@"startMs"] longLongValue];
  const long long endMs = [range[@"endMs"] longLongValue];
  const long long maximumFrames = [manifest[@"runtime"][@"maxFrames"] longLongValue];
  if (!IntegerNumber(range[@"startMs"], 0, LLONG_MAX) ||
      !IntegerNumber(range[@"endMs"], 1, LLONG_MAX) || endMs <= startMs ||
      endMs - startMs > [manifest[@"runtime"][@"maxDurationMs"] longLongValue] ||
      maximumFrames < 1) FSAnchorColorFail("range-invalid");
  const TrajectoryTypes trajectoryTypes = ValidateTrajectories(
      request[@"trajectories"], range, maximumFrames);
  ValidateAnchors(request[@"roleAnchors"], trajectoryTypes, @"role",
                  [NSSet setWithArray:@[@"player", @"referee"]], false);
  ValidateAnchors(request[@"teamAnchors"], trajectoryTypes, @"teamSide",
                  [NSSet setWithArray:@[@"home", @"away"]], true);
  NSDictionary* output = invocation[@"output"];
  ExactKeys(output, @[@"filePath", @"maximumBytes"], "output");
  if (![[output[@"filePath"] stringByStandardizingPath] isEqual:[outputPath stringByStandardizingPath]]) {
    FSAnchorColorFail("output-path-invalid");
  }
  const std::size_t maximumOutputBytes = std::min<std::size_t>(
      [output[@"maximumBytes"] unsignedLongLongValue],
      [manifest[@"runtime"][@"maxOutputBytes"] unsignedLongLongValue]);
  const double sampleFps = [manifest[@"runtime"][@"sampleFps"] doubleValue];
  if (!maximumOutputBytes || !std::isfinite(sampleFps) || sampleFps <= 0 || sampleFps > 60) {
    FSAnchorColorFail("runtime-limits-invalid");
  }
  NSDictionary* specification = ValidateSpecification(LoadJson(model[@"filePath"], kMaximumModelBytes));
  NSString* providerFingerprint = ProviderFingerprint(manifest, capabilities);
  return FSAnchorColorInvocation{
    manifest, request, specification, capabilities, source[@"filePath"], outputPath,
    providerFingerprint, requestFingerprint,
    maximumOutputBytes, sampleFps, maximumFrames,
    std::clamp([manifest[@"runtime"][@"cpuThreads"] intValue], 1, 16),
  };
}

void FSWriteAnchorColorResult(
    const FSAnchorColorInvocation& invocation,
    NSArray<NSDictionary*>* classifications) {
  using namespace fs_tracking_native;
  NSDictionary* result = @{
    @"schemaVersion": @1, @"protocol": @(kResultProtocol),
    @"provider": @{
      @"id": invocation.manifest[@"providerId"],
      @"version": invocation.manifest[@"providerVersion"],
      @"fingerprintSha256": invocation.providerFingerprint,
    },
    @"stage": invocation.manifest[@"stage"], @"capabilities": invocation.capabilities,
    @"sourceFingerprint": invocation.request[@"sourceFingerprint"],
    @"requestFingerprint": invocation.requestFingerprint,
    @"range": invocation.request[@"range"],
    @"payload": @{@"classifications": classifications},
  };
  NSMutableData* encoded = [CanonicalJson(result) mutableCopy];
  const std::uint8_t newline = '\n';
  [encoded appendBytes:&newline length:1];
  if (!encoded.length || encoded.length > invocation.maximumOutputBytes) {
    FSAnchorColorFail("result-size-invalid");
  }
  WriteAtomic(invocation.outputPath, encoded);
}
