#import <Foundation/Foundation.h>

#include <algorithm>
#include <cmath>
#include <limits>
#include <map>
#include <numeric>
#include <set>
#include <string>
#include <utility>
#include <vector>

#include "BYTETracker.h"
#include "bytetrack-native-provider.hpp"

namespace {

struct Observation {
  NSString* identifier;
  std::string entityType;
  long long atMs;
  long long frameIndex;
  float left;
  float top;
  float width;
  float height;
  float confidence;
};

struct Trajectory {
  std::string entityType;
  int trackId;
  std::vector<int> observationIndices;
};

struct AssociationProfile {
  int trackBuffer;
  float trackThreshold;
  float highThreshold;
  float matchThreshold;
  float secondMatchThreshold;
  float unconfirmedMatchThreshold;
};

using FrameKey = std::pair<long long, long long>;

struct MotionOffset {
  float x;
  float y;
};

AssociationProfile ProfileForEntity(const std::string& entityType) {
  if (entityType == "ball") {
    return AssociationProfile{12, 0.02F, 0.05F, 0.95F, 0.95F, 0.90F};
  }
  return AssociationProfile{30, 0.20F, 0.35F, 0.80F, 0.50F, 0.70F};
}

bool IsMotionReference(const Observation& value) {
  return value.entityType == "person" || value.entityType == "player" ||
      value.entityType == "referee";
}

float Median(std::vector<float> values) {
  if (values.empty()) return 0.0F;
  const std::size_t middle = values.size() / 2;
  std::nth_element(values.begin(), values.begin() + middle, values.end());
  return values[middle];
}

float CenterDistanceSquared(const Observation& left, const Observation& right) {
  const float x = left.left + left.width * 0.5F - right.left - right.width * 0.5F;
  const float y = left.top + left.height * 0.5F - right.top - right.height * 0.5F;
  return x * x + y * y;
}

int NearestObservation(
    int source,
    const std::vector<int>& candidates,
    const std::vector<Observation>& observations,
    float* distanceSquared) {
  int nearest = -1;
  float best = std::numeric_limits<float>::max();
  for (int candidate : candidates) {
    const float distance = CenterDistanceSquared(observations[source], observations[candidate]);
    if (distance < best) {
      best = distance;
      nearest = candidate;
    }
  }
  *distanceSquared = best;
  return nearest;
}

MotionOffset EstimateFrameMotion(
    const std::vector<int>& previous,
    const std::vector<int>& current,
    const std::vector<Observation>& observations) {
  struct Delta { float x; float y; };
  std::vector<Delta> candidates;
  for (int currentIndex : current) {
    float distance = 0.0F;
    const int previousIndex = NearestObservation(currentIndex, previous, observations, &distance);
    if (previousIndex < 0 || distance > 0.15F * 0.15F) continue;
    float reverseDistance = 0.0F;
    if (NearestObservation(previousIndex, current, observations, &reverseDistance) != currentIndex) continue;
    const Observation& before = observations[previousIndex];
    const Observation& after = observations[currentIndex];
    candidates.push_back(Delta{
      after.left + after.width * 0.5F - before.left - before.width * 0.5F,
      after.top + after.height * 0.5F - before.top - before.height * 0.5F,
    });
  }
  if (candidates.size() < 4) return MotionOffset{0.0F, 0.0F};

  std::vector<float> xValues;
  std::vector<float> yValues;
  xValues.reserve(candidates.size());
  yValues.reserve(candidates.size());
  for (const Delta& value : candidates) {
    xValues.push_back(value.x);
    yValues.push_back(value.y);
  }
  const float medianX = Median(xValues);
  const float medianY = Median(yValues);
  std::vector<float> residuals;
  residuals.reserve(candidates.size());
  for (const Delta& value : candidates) {
    residuals.push_back(std::hypot(value.x - medianX, value.y - medianY));
  }
  const float residualLimit = std::clamp(3.0F * Median(residuals), 0.008F, 0.06F);
  xValues.clear();
  yValues.clear();
  for (const Delta& value : candidates) {
    if (std::hypot(value.x - medianX, value.y - medianY) > residualLimit) continue;
    xValues.push_back(value.x);
    yValues.push_back(value.y);
  }
  if (xValues.size() < 4) return MotionOffset{0.0F, 0.0F};
  const MotionOffset result{Median(xValues), Median(yValues)};
  return std::hypot(result.x, result.y) <= 0.08F ? result : MotionOffset{0.0F, 0.0F};
}

std::map<FrameKey, MotionOffset> BuildFrameMotionOffsets(
    const std::vector<Observation>& observations,
    double sampleFps) {
  std::map<FrameKey, std::vector<int>> frames;
  for (std::size_t index = 0; index < observations.size(); index += 1) {
    const Observation& value = observations[index];
    std::vector<int>& references = frames[FrameKey{value.atMs, value.frameIndex}];
    if (IsMotionReference(value)) references.push_back(static_cast<int>(index));
  }
  std::map<FrameKey, MotionOffset> offsets;
  std::vector<int> previous;
  long long previousAtMs = -1;
  MotionOffset cumulative{0.0F, 0.0F};
  const double maximumReferenceGapMs = 3.0 * 1000.0 / sampleFps;
  for (const auto& [key, references] : frames) {
    if (references.size() >= 4) {
      if (previous.size() >= 4 && key.first - previousAtMs <= maximumReferenceGapMs) {
        const MotionOffset delta = EstimateFrameMotion(previous, references, observations);
        cumulative.x += delta.x;
        cumulative.y += delta.y;
      }
      previous = references;
      previousAtMs = key.first;
    }
    offsets.emplace(key, cumulative);
  }
  return offsets;
}

Observation ParseObservation(NSDictionary* value) {
  NSDictionary* box = value[@"box"];
  return Observation{
    value[@"id"], [value[@"entityType"] UTF8String], [value[@"atMs"] longLongValue],
    [value[@"frameIndex"] longLongValue], [box[@"left"] floatValue], [box[@"top"] floatValue],
    [box[@"width"] floatValue], [box[@"height"] floatValue], [value[@"confidence"] floatValue],
  };
}

bool ObservationOrder(const Observation& left, const Observation& right) {
  if (left.atMs != right.atMs) return left.atMs < right.atMs;
  if (left.frameIndex != right.frameIndex) return left.frameIndex < right.frameIndex;
  return [left.identifier compare:right.identifier] == NSOrderedAscending;
}

void MergeTrack(Trajectory* target, const STrack& track) {
  std::set<int> known(target->observationIndices.begin(), target->observationIndices.end());
  for (int index : track.observation_indices) {
    if (index < 0) FSByteTrackFail("bytetrack-observation-index-invalid");
    if (known.insert(index).second) target->observationIndices.push_back(index);
  }
}

std::vector<Trajectory> AssociateEntity(
    const std::string& entityType,
    const std::vector<Observation>& observations,
    const std::map<FrameKey, MotionOffset>& motionOffsets,
    double sampleFps) {
  std::vector<int> indices;
  for (std::size_t index = 0; index < observations.size(); index += 1) {
    if (observations[index].entityType == entityType) indices.push_back(static_cast<int>(index));
  }
  std::sort(indices.begin(), indices.end(), [&](int left, int right) {
    return ObservationOrder(observations[left], observations[right]);
  });
  if (indices.empty()) return {};

  const AssociationProfile profile = ProfileForEntity(entityType);
  BYTETracker tracker(
      std::max(1, static_cast<int>(std::llround(sampleFps))), profile.trackBuffer,
      profile.trackThreshold, profile.highThreshold, profile.matchThreshold,
      profile.secondMatchThreshold, profile.unconfirmedMatchThreshold);
  std::map<int, Trajectory> tracks;
  const double stepMs = 1000.0 / sampleFps;
  long long previousAtMs = observations[indices.front()].atMs;
  std::size_t cursor = 0;
  while (cursor < indices.size()) {
    const Observation& first = observations[indices[cursor]];
    if (cursor > 0) {
      const long long gap = std::max<long long>(0, first.atMs - previousAtMs);
      const int missing = std::clamp(static_cast<int>(std::llround(gap / stepMs)) - 1, 0, 1000);
      for (int count = 0; count < missing; count += 1) tracker.update({});
    }
    std::vector<Object> objects;
    std::size_t next = cursor;
    while (next < indices.size()) {
      const Observation& value = observations[indices[next]];
      if (value.atMs != first.atMs || value.frameIndex != first.frameIndex) break;
      const auto motion = motionOffsets.find(FrameKey{value.atMs, value.frameIndex});
      const MotionOffset offset = motion == motionOffsets.end()
        ? MotionOffset{0.0F, 0.0F} : motion->second;
      objects.push_back(Object{
        FSRect{(value.left - offset.x) * 1000.0F, (value.top - offset.y) * 1000.0F,
               value.width * 1000.0F, value.height * 1000.0F},
        0, value.confidence, indices[next],
      });
      next += 1;
    }
    for (const STrack& track : tracker.update(objects)) {
      auto [entry, inserted] = tracks.try_emplace(
          track.track_id, Trajectory{entityType, track.track_id, {}});
      MergeTrack(&entry->second, track);
    }
    previousAtMs = first.atMs;
    cursor = next;
  }
  std::vector<Trajectory> result;
  for (auto& [unused, track] : tracks) {
    std::sort(track.observationIndices.begin(), track.observationIndices.end(), [&](int left, int right) {
      return ObservationOrder(observations[left], observations[right]);
    });
    if (!track.observationIndices.empty()) result.push_back(std::move(track));
  }
  return result;
}

NSDictionary* ResultTrajectory(
    const Trajectory& trajectory,
    const std::vector<Observation>& observations,
    double sampleFps) {
  NSMutableArray<NSString*>* identifiers = [NSMutableArray array];
  NSMutableArray<NSNumber*>* discontinuities = [NSMutableArray array];
  double confidence = 0;
  const double continuityLimitMs = 1.5 * 1000.0 / sampleFps;
  const Observation* previous = nullptr;
  for (int index : trajectory.observationIndices) {
    if (index < 0 || static_cast<std::size_t>(index) >= observations.size()) {
      FSByteTrackFail("bytetrack-observation-reference-invalid");
    }
    const Observation& value = observations[index];
    if (value.entityType != trajectory.entityType) FSByteTrackFail("bytetrack-entity-mismatch");
    [identifiers addObject:value.identifier];
    confidence += value.confidence;
    if (previous && value.atMs - previous->atMs > continuityLimitMs) {
      [discontinuities addObject:@(value.atMs)];
    }
    previous = &value;
  }
  return @{
    @"id": [NSString stringWithFormat:@"bytetrack-%s-%d", trajectory.entityType.c_str(), trajectory.trackId],
    @"entityType": [NSString stringWithUTF8String:trajectory.entityType.c_str()],
    @"observationIds": identifiers,
    @"confidence": @(confidence / trajectory.observationIndices.size()),
    @"discontinuitiesMs": discontinuities,
  };
}

}  // namespace

NSArray<NSDictionary*>* FSRunByteTrackAssociation(const FSByteTrackInvocation& invocation) {
  NSArray* values = invocation.request[@"observations"];
  std::vector<Observation> observations;
  observations.reserve(values.count);
  for (NSDictionary* value in values) observations.push_back(ParseObservation(value));

  const std::map<FrameKey, MotionOffset> motionOffsets =
      BuildFrameMotionOffsets(observations, invocation.sampleFps);
  std::vector<Trajectory> tracks;
  for (const std::string& entity : {"person", "player", "ball", "referee"}) {
    std::vector<Trajectory> values = AssociateEntity(
        entity, observations, motionOffsets, invocation.sampleFps);
    tracks.insert(tracks.end(), std::make_move_iterator(values.begin()), std::make_move_iterator(values.end()));
  }
  std::vector<bool> assigned(observations.size(), false);
  for (const Trajectory& track : tracks) {
    for (int index : track.observationIndices) {
      if (index < 0 || static_cast<std::size_t>(index) >= observations.size() || assigned[index]) {
        FSByteTrackFail("bytetrack-lineage-invalid");
      }
      assigned[index] = true;
    }
  }
  std::sort(tracks.begin(), tracks.end(), [&](const Trajectory& left, const Trajectory& right) {
    if (left.entityType != right.entityType) return left.entityType < right.entityType;
    const Observation& leftFirst = observations[left.observationIndices.front()];
    const Observation& rightFirst = observations[right.observationIndices.front()];
    if (leftFirst.atMs != rightFirst.atMs) return leftFirst.atMs < rightFirst.atMs;
    return left.trackId < right.trackId;
  });
  if (tracks.size() > 1024) FSByteTrackFail("trajectory-limit-exceeded");
  NSMutableArray<NSDictionary*>* result = [NSMutableArray arrayWithCapacity:tracks.size()];
  for (const Trajectory& track : tracks) {
    [result addObject:ResultTrajectory(track, observations, invocation.sampleFps)];
  }
  return result;
}

int main(int argc, char** argv) {
  @autoreleasepool {
    try {
      FSByteTrackInvocation invocation = FSLoadByteTrackInvocation(argc, argv);
      FSWriteByteTrackResult(invocation, FSRunByteTrackAssociation(invocation));
      return 0;
    } catch (const std::exception& error) {
      std::fprintf(stderr, "%s\n", error.what());
      return 1;
    }
  }
}
