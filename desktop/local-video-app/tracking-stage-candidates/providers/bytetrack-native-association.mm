#import <Foundation/Foundation.h>

#include <algorithm>
#include <cmath>
#include <map>
#include <numeric>
#include <set>
#include <string>
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
    double sampleFps) {
  std::vector<int> indices;
  for (std::size_t index = 0; index < observations.size(); index += 1) {
    if (observations[index].entityType == entityType) indices.push_back(static_cast<int>(index));
  }
  std::sort(indices.begin(), indices.end(), [&](int left, int right) {
    return ObservationOrder(observations[left], observations[right]);
  });
  if (indices.empty()) return {};

  BYTETracker tracker(std::max(1, static_cast<int>(std::llround(sampleFps))), 30);
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
      objects.push_back(Object{
        FSRect{value.left * 1000.0F, value.top * 1000.0F,
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

  std::vector<Trajectory> tracks;
  for (const std::string& entity : {"person", "player", "ball", "referee"}) {
    std::vector<Trajectory> values = AssociateEntity(entity, observations, invocation.sampleFps);
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
