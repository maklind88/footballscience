#pragma once

#include <cstdint>
#include <functional>
#include <string>
#include <vector>

struct FSDecodedFrame {
  std::vector<float> tensor;
  float ratio = 0;
  int width = 0;
  int height = 0;
  std::int64_t atMs = 0;
  std::int64_t frameIndex = 0;
};

using FSDecodedFrameHandler = std::function<void(FSDecodedFrame&&)>;

[[noreturn]] void FSProviderFail(const std::string& message);

void FSDecodeSampledH264Frames(
    const std::string& sourcePath,
    std::int64_t startMs,
    std::int64_t endMs,
    double sampleFps,
    int decoderThreads,
    std::int64_t maximumFrames,
    const FSDecodedFrameHandler& handler);
