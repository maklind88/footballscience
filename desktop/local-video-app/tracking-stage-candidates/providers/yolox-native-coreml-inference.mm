#define ORT_API_MANUAL_INIT

#import <CommonCrypto/CommonDigest.h>
#import <Foundation/Foundation.h>
#import <mach-o/getsect.h>
#import <mach-o/ldsyms.h>

#include <dlfcn.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

#include <algorithm>
#include <array>
#include <cerrno>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <numeric>
#include <string>
#include <vector>

#include "coreml_provider_factory.h"
#include "onnxruntime_cxx_api.h"
#include "yolox-native-ffmpeg-decoder.hpp"
#include "yolox-native-coreml-provider.hpp"

namespace {

constexpr int kInputSize = 640;
constexpr int kPredictionCount = 8400;
constexpr int kPredictionWidth = 85;
constexpr int kPersonClass = 0;
constexpr int kBallClass = 32;
constexpr float kPersonThreshold = 0.2F;
constexpr float kBallThreshold = 0.02F;
constexpr float kNmsThreshold = 0.45F;
constexpr char kEmbeddedOrtSha256[] = "183dca3132c8f0e2f0a1a30da3bcf7dee634cd6a7d5bf99b47f3d7ffe2791799";

using OrtGetApiBaseFn = const OrtApiBase* (*)();
using AppendCoreMLFn = OrtStatus* (*)(OrtSessionOptions*, uint32_t);

struct Candidate {
  __strong NSString* entityType = nil;
  float confidence = 0;
  float left = 0;
  float top = 0;
  float right = 0;
  float bottom = 0;
  std::size_t sourceIndex = 0;
};

std::string ErrorText(const char* action) {
  return std::string(action) + ": " + std::strerror(errno);
}

std::string Sha256Hex(const std::uint8_t* bytes, std::size_t size) {
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(bytes, static_cast<CC_LONG>(size), digest);
  constexpr char alphabet[] = "0123456789abcdef";
  std::string value(CC_SHA256_DIGEST_LENGTH * 2, '0');
  for (std::size_t index = 0; index < CC_SHA256_DIGEST_LENGTH; index += 1) {
    value[index * 2] = alphabet[digest[index] >> 4];
    value[index * 2 + 1] = alphabet[digest[index] & 0x0F];
  }
  return value;
}

void WriteAll(int fd, const std::uint8_t* bytes, std::size_t size) {
  std::size_t offset = 0;
  while (offset < size) {
    const ssize_t count = write(fd, bytes + offset, size - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) FSProviderFail(ErrorText("embedded-runtime-write-failed"));
    offset += static_cast<std::size_t>(count);
  }
}

template <typename Function>
Function RequireSymbol(void* handle, const char* name) {
  dlerror();
  void* symbol = dlsym(handle, name);
  const char* error = dlerror();
  if (error || !symbol) {
    FSProviderFail(std::string("embedded-runtime-symbol-missing:") + name);
  }
  return reinterpret_cast<Function>(symbol);
}

class EmbeddedOrtRuntime {
 public:
  EmbeddedOrtRuntime() {
    unsigned long sectionSize = 0;
    const std::uint8_t* section = getsectiondata(
        &_mh_execute_header, "__DATA", "__ortlib", &sectionSize);
    if (!section || !sectionSize || Sha256Hex(section, sectionSize) != kEmbeddedOrtSha256) {
      FSProviderFail("embedded-runtime-checksum-mismatch");
    }
    const char* tmp = std::getenv("TMPDIR");
    if (!tmp || tmp[0] != '/') FSProviderFail("private-tmpdir-required");
    struct stat temporaryStat{};
    if (lstat(tmp, &temporaryStat) != 0 || !S_ISDIR(temporaryStat.st_mode) ||
        S_ISLNK(temporaryStat.st_mode)) FSProviderFail("private-tmpdir-unsafe");
    extractedPath_ = std::string(tmp) +
        (tmp[std::strlen(tmp) - 1] == '/' ? "" : "/") + "libonnxruntime.1.19.2.dylib";
    const int fd = open(extractedPath_.c_str(),
                        O_CREAT | O_EXCL | O_WRONLY | O_CLOEXEC | O_NOFOLLOW, 0500);
    if (fd < 0) FSProviderFail(ErrorText("embedded-runtime-open-failed"));
    try {
      WriteAll(fd, section, sectionSize);
      if (fsync(fd) != 0) FSProviderFail(ErrorText("embedded-runtime-fsync-failed"));
      if (close(fd) != 0) FSProviderFail(ErrorText("embedded-runtime-close-failed"));
    } catch (...) {
      close(fd);
      unlink(extractedPath_.c_str());
      throw;
    }
    handle_ = dlopen(extractedPath_.c_str(), RTLD_NOW | RTLD_LOCAL);
    if (!handle_) FSProviderFail(std::string("embedded-runtime-load-failed:") + dlerror());
    auto getApiBase = RequireSymbol<OrtGetApiBaseFn>(handle_, "OrtGetApiBase");
    const OrtApi* api = getApiBase()->GetApi(ORT_API_VERSION);
    if (!api) FSProviderFail("embedded-runtime-api-mismatch");
    Ort::InitApi(api);
    appendCoreML_ = RequireSymbol<AppendCoreMLFn>(
        handle_, "OrtSessionOptionsAppendExecutionProvider_CoreML");
  }

  ~EmbeddedOrtRuntime() {
    if (handle_) dlclose(handle_);
  }

  void AppendCoreML(Ort::SessionOptions& options) const {
    Ort::ThrowOnError(appendCoreML_(options, COREML_FLAG_ONLY_ALLOW_STATIC_INPUT_SHAPES));
  }

 private:
  std::string extractedPath_;
  void* handle_ = nullptr;
  AppendCoreMLFn appendCoreML_ = nullptr;
};

void GridForIndex(int index, int* stride, int* gridX, int* gridY) {
  if (index < 6400) {
    *stride = 8;
    *gridX = index % 80;
    *gridY = index / 80;
  } else if (index < 8000) {
    const int local = index - 6400;
    *stride = 16;
    *gridX = local % 40;
    *gridY = local / 40;
  } else {
    const int local = index - 8000;
    *stride = 32;
    *gridX = local % 20;
    *gridY = local / 20;
  }
}

std::vector<std::size_t> Nms(const std::vector<Candidate>& candidates) {
  std::vector<std::size_t> order(candidates.size());
  std::iota(order.begin(), order.end(), 0);
  std::sort(order.begin(), order.end(), [&](std::size_t left, std::size_t right) {
    if (candidates[left].confidence != candidates[right].confidence) {
      return candidates[left].confidence > candidates[right].confidence;
    }
    return candidates[left].sourceIndex < candidates[right].sourceIndex;
  });
  std::vector<std::size_t> keep;
  while (!order.empty()) {
    const std::size_t selected = order.front();
    keep.push_back(selected);
    const Candidate& anchor = candidates[selected];
    const float anchorArea = (anchor.right - anchor.left + 1) * (anchor.bottom - anchor.top + 1);
    std::vector<std::size_t> remaining;
    for (std::size_t offset = 1; offset < order.size(); offset += 1) {
      const Candidate& value = candidates[order[offset]];
      const float left = std::max(anchor.left, value.left);
      const float top = std::max(anchor.top, value.top);
      const float right = std::min(anchor.right, value.right);
      const float bottom = std::min(anchor.bottom, value.bottom);
      const float width = std::max(0.0F, right - left + 1);
      const float height = std::max(0.0F, bottom - top + 1);
      const float intersection = width * height;
      const float valueArea = (value.right - value.left + 1) * (value.bottom - value.top + 1);
      const float overlap = intersection / (anchorArea + valueArea - intersection);
      if (overlap <= kNmsThreshold) remaining.push_back(order[offset]);
    }
    order = std::move(remaining);
  }
  return keep;
}

double BoundedNormalizedExtent(double origin, double extent) {
  double value = std::min(extent, 1.0 - origin);
  if (origin + value > 1.0) value = std::nextafter(value, 0.0);
  if (!(value > 0) || origin + value > 1.0) FSProviderFail("detection-box-invalid");
  return value;
}

NSDictionary* NormalizedBox(const Candidate& value, std::size_t width, std::size_t height) {
  const double frameWidth = static_cast<double>(width);
  const double frameHeight = static_cast<double>(height);
  const double left = std::clamp(static_cast<double>(value.left), 0.0, frameWidth - 1.0);
  const double top = std::clamp(static_cast<double>(value.top), 0.0, frameHeight - 1.0);
  const double right = std::clamp(static_cast<double>(value.right), left + 1.0, frameWidth);
  const double bottom = std::clamp(static_cast<double>(value.bottom), top + 1.0, frameHeight);
  const double normalizedLeft = left / frameWidth;
  const double normalizedTop = top / frameHeight;
  const double normalizedWidth = BoundedNormalizedExtent(
      normalizedLeft, (right - left) / frameWidth);
  const double normalizedHeight = BoundedNormalizedExtent(
      normalizedTop, (bottom - top) / frameHeight);
  return @{
    @"left": @(normalizedLeft),
    @"top": @(normalizedTop),
    @"width": @(normalizedWidth),
    @"height": @(normalizedHeight),
  };
}

void CollectClass(
    const float* prediction,
    int classIndex,
    NSString* entityType,
    float threshold,
    float ratio,
    std::vector<Candidate>* retained) {
  std::vector<Candidate> candidates;
  for (int index = 0; index < kPredictionCount; index += 1) {
    const float* row = prediction + index * kPredictionWidth;
    const float confidence = row[4] * row[5 + classIndex];
    if (!(confidence > threshold) || !std::isfinite(confidence)) continue;
    int stride = 0;
    int gridX = 0;
    int gridY = 0;
    GridForIndex(index, &stride, &gridX, &gridY);
    const float centerX = (row[0] + gridX) * stride;
    const float centerY = (row[1] + gridY) * stride;
    const float width = std::exp(row[2]) * stride;
    const float height = std::exp(row[3]) * stride;
    Candidate value;
    value.entityType = entityType;
    value.confidence = confidence;
    value.left = (centerX - width / 2) / ratio;
    value.top = (centerY - height / 2) / ratio;
    value.right = (centerX + width / 2) / ratio;
    value.bottom = (centerY + height / 2) / ratio;
    value.sourceIndex = static_cast<std::size_t>(index);
    candidates.push_back(value);
  }
  for (std::size_t index : Nms(candidates)) retained->push_back(candidates[index]);
}

NSArray<NSDictionary*>* FrameDetections(
    const float* prediction,
    float ratio,
    std::size_t width,
    std::size_t height,
    NSSet<NSString*>* capabilities,
    std::int64_t atMs,
    std::int64_t frameIndex) {
  std::vector<Candidate> values;
  if ([capabilities containsObject:@"detect:person"]) {
    CollectClass(prediction, kPersonClass, @"person", kPersonThreshold, ratio, &values);
  } else if ([capabilities containsObject:@"detect:player"]) {
    CollectClass(prediction, kPersonClass, @"player", kPersonThreshold, ratio, &values);
  }
  if ([capabilities containsObject:@"detect:ball"]) {
    CollectClass(prediction, kBallClass, @"ball", kBallThreshold, ratio, &values);
  }
  std::sort(values.begin(), values.end(), [](const Candidate& left, const Candidate& right) {
    if (left.confidence != right.confidence) return left.confidence > right.confidence;
    const NSComparisonResult compared = [left.entityType compare:right.entityType];
    if (compared != NSOrderedSame) return compared == NSOrderedAscending;
    return left.sourceIndex < right.sourceIndex;
  });
  NSMutableArray<NSDictionary*>* result = [NSMutableArray arrayWithCapacity:values.size()];
  for (std::size_t ordinal = 0; ordinal < values.size(); ordinal += 1) {
    Candidate value = values[ordinal];
    [result addObject:@{
      @"id": [NSString stringWithFormat:@"det-%lld-%@-%zu", frameIndex, value.entityType, ordinal],
      @"atMs": @(atMs), @"frameIndex": @(frameIndex),
      @"entityType": value.entityType, @"confidence": @(value.confidence),
      @"box": NormalizedBox(value, width, height),
    }];
  }
  return result;
}

}  // namespace

NSArray<NSDictionary*>* FSRunYoloxDetection(const FSProviderInvocation& invocation) {
  NSDictionary* range = invocation.request[@"range"];
  const std::int64_t startMs = [range[@"startMs"] longLongValue];
  const std::int64_t endMs = [range[@"endMs"] longLongValue];
  const std::int64_t maximumDurationMs =
      [invocation.manifest[@"runtime"][@"maxDurationMs"] longLongValue];
  if (startMs < 0 || endMs <= startMs || endMs - startMs > maximumDurationMs) {
    FSProviderFail("request-range-invalid");
  }

  EmbeddedOrtRuntime runtime;
  Ort::Env environment(ORT_LOGGING_LEVEL_ERROR, "fs-native-coreml-provider");
  Ort::SessionOptions options;
  options.SetIntraOpNumThreads(
      [invocation.manifest[@"runtime"][@"cpuThreads"] intValue]);
  options.SetInterOpNumThreads(1);
  options.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
  options.SetLogSeverityLevel(3);
  runtime.AppendCoreML(options);
  Ort::Session session(environment, invocation.modelPath.fileSystemRepresentation, options);

  const double sampleFps = [invocation.manifest[@"runtime"][@"sampleFps"] doubleValue];
  const int cpuThreads = [invocation.manifest[@"runtime"][@"cpuThreads"] intValue];
  const std::int64_t maximumFrames =
      [invocation.manifest[@"runtime"][@"maxFrames"] longLongValue];
  NSMutableArray<NSDictionary*>* observations = [NSMutableArray array];
  NSSet<NSString*>* capabilities = [NSSet setWithArray:invocation.capabilities];
  FSDecodeSampledH264Frames(
      invocation.sourcePath.fileSystemRepresentation,
      startMs,
      endMs,
      sampleFps,
      cpuThreads,
      maximumFrames,
      [&](FSDecodedFrame&& frame) {
    @autoreleasepool {
      const std::array<int64_t, 4> shape{1, 3, kInputSize, kInputSize};
      Ort::MemoryInfo memory = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
      Ort::Value tensor = Ort::Value::CreateTensor<float>(
          memory, frame.tensor.data(), frame.tensor.size(), shape.data(), shape.size());
      const char* inputNames[] = {"images"};
      const char* outputNames[] = {"output"};
      auto modelOutput = session.Run(
          Ort::RunOptions{nullptr}, inputNames, &tensor, 1, outputNames, 1);
      if (modelOutput.size() != 1 || !modelOutput[0].IsTensor() ||
          modelOutput[0].GetTensorTypeAndShapeInfo().GetShape() !=
              std::vector<int64_t>({1, kPredictionCount, kPredictionWidth})) {
        FSProviderFail("model-output-invalid");
      }
      NSArray* frameValues = FrameDetections(
          modelOutput[0].GetTensorData<float>(), frame.ratio,
          static_cast<std::size_t>(frame.width), static_cast<std::size_t>(frame.height),
          capabilities, frame.atMs, frame.frameIndex);
      [observations addObjectsFromArray:frameValues];
      if (observations.count > 250000) FSProviderFail("observation-limit-exceeded");
    }
  });
  return observations;
}
