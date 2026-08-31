extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavutil/dict.h>
#include <libavutil/error.h>
#include <libavutil/mathematics.h>
#include <libswscale/swscale.h>
}

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <limits>
#include <memory>
#include <string>
#include <vector>

#include "yolox-native-ffmpeg-decoder.hpp"

namespace {

constexpr int kInputSize = 640;

std::string ErrorText(int code) {
  char value[AV_ERROR_MAX_STRING_SIZE] = {0};
  av_strerror(code, value, sizeof(value));
  return value;
}

void RequireStatus(int status, const char* label) {
  if (status < 0) FSProviderFail(std::string(label) + ":" + ErrorText(status));
}

struct FormatCloser {
  void operator()(AVFormatContext* value) const {
    if (value) avformat_close_input(&value);
  }
};

struct CodecCloser {
  void operator()(AVCodecContext* value) const {
    if (value) avcodec_free_context(&value);
  }
};

struct PacketCloser {
  void operator()(AVPacket* value) const {
    if (value) av_packet_free(&value);
  }
};

struct FrameCloser {
  void operator()(AVFrame* value) const {
    if (value) av_frame_free(&value);
  }
};

struct ScalerCloser {
  void operator()(SwsContext* value) const {
    if (value) sws_freeContext(value);
  }
};

using FormatPointer = std::unique_ptr<AVFormatContext, FormatCloser>;
using CodecPointer = std::unique_ptr<AVCodecContext, CodecCloser>;
using PacketPointer = std::unique_ptr<AVPacket, PacketCloser>;
using FramePointer = std::unique_ptr<AVFrame, FrameCloser>;
using ScalerPointer = std::unique_ptr<SwsContext, ScalerCloser>;

std::vector<float> PreprocessFrame(AVFrame* frame, float* ratio, ScalerPointer* scaler) {
  if (!frame || frame->width < 2 || frame->height < 2) FSProviderFail("source-metadata-invalid");
  *ratio = std::min(
      static_cast<float>(kInputSize) / frame->height,
      static_cast<float>(kInputSize) / frame->width);
  const int resizedWidth = std::max(1, static_cast<int>(frame->width * *ratio));
  const int resizedHeight = std::max(1, static_cast<int>(frame->height * *ratio));
  SwsContext* updated = sws_getCachedContext(
      scaler->get(),
      frame->width,
      frame->height,
      static_cast<AVPixelFormat>(frame->format),
      resizedWidth,
      resizedHeight,
      AV_PIX_FMT_BGR24,
      SWS_BILINEAR,
      nullptr,
      nullptr,
      nullptr);
  if (!updated) {
    scaler->release();
    FSProviderFail("source-scale-context-failed");
  }
  scaler->release();
  scaler->reset(updated);
  std::vector<std::uint8_t> bgr(static_cast<std::size_t>(resizedWidth) * resizedHeight * 3);
  std::uint8_t* destination[] = {bgr.data(), nullptr, nullptr, nullptr};
  int destinationLines[] = {resizedWidth * 3, 0, 0, 0};
  if (sws_scale(
      scaler->get(), frame->data, frame->linesize, 0, frame->height,
      destination, destinationLines) != resizedHeight) {
    FSProviderFail("source-scale-failed");
  }

  std::vector<float> tensor(3 * kInputSize * kInputSize, 114.0F);
  const std::size_t plane = kInputSize * kInputSize;
  for (int y = 0; y < resizedHeight; y += 1) {
    for (int x = 0; x < resizedWidth; x += 1) {
      const std::size_t sourceOffset = static_cast<std::size_t>(y * resizedWidth + x) * 3;
      const std::size_t targetOffset = static_cast<std::size_t>(y * kInputSize + x);
      tensor[targetOffset] = bgr[sourceOffset];
      tensor[plane + targetOffset] = bgr[sourceOffset + 1];
      tensor[plane * 2 + targetOffset] = bgr[sourceOffset + 2];
    }
  }
  return tensor;
}

double FrameTimeMs(AVFrame* frame, AVStream* stream, std::int64_t decodedFrames, double fps) {
  const std::int64_t timestamp = frame->best_effort_timestamp;
  if (timestamp != AV_NOPTS_VALUE) {
    const std::int64_t origin = stream->start_time == AV_NOPTS_VALUE ? 0 : stream->start_time;
    return (timestamp - origin) * av_q2d(stream->time_base) * 1000.0;
  }
  return decodedFrames * 1000.0 / fps;
}

}  // namespace

void FSDecodeSampledH264Frames(
    const std::string& sourcePath,
    std::int64_t startMs,
    std::int64_t endMs,
    double sampleFps,
    int decoderThreads,
    std::int64_t maximumFrames,
    const FSDecodedFrameHandler& handler) {
  if (sourcePath.empty() || sourcePath.front() != '/' || startMs < 0 || endMs <= startMs ||
      !std::isfinite(sampleFps) || sampleFps <= 0 || maximumFrames < 1 || !handler) {
    FSProviderFail("decode-request-invalid");
  }
  av_log_set_level(AV_LOG_ERROR);
  AVFormatContext* rawFormat = nullptr;
  AVDictionary* openOptions = nullptr;
  av_dict_set(&openOptions, "protocol_whitelist", "file", 0);
  av_dict_set(&openOptions, "format_whitelist", "mov", 0);
  av_dict_set_int(&openOptions, "probesize", 16 * 1024 * 1024, 0);
  av_dict_set_int(&openOptions, "analyzeduration", 5 * AV_TIME_BASE, 0);
  const int openStatus = avformat_open_input(&rawFormat, sourcePath.c_str(), nullptr, &openOptions);
  av_dict_free(&openOptions);
  RequireStatus(openStatus, "source-open-failed");
  FormatPointer format(rawFormat);
  format->max_streams = 16;
  RequireStatus(avformat_find_stream_info(format.get(), nullptr), "source-stream-info-failed");
  const int streamIndex = av_find_best_stream(
      format.get(), AVMEDIA_TYPE_VIDEO, -1, -1, nullptr, 0);
  RequireStatus(streamIndex, "source-video-stream-missing");
  AVStream* stream = format->streams[streamIndex];
  if (stream->codecpar->codec_id != AV_CODEC_ID_H264) FSProviderFail("source-codec-unsupported");
  const AVCodec* codec = avcodec_find_decoder(AV_CODEC_ID_H264);
  if (!codec) FSProviderFail("h264-decoder-unavailable");
  CodecPointer decoder(avcodec_alloc_context3(codec));
  if (!decoder) FSProviderFail("h264-decoder-allocation-failed");
  RequireStatus(avcodec_parameters_to_context(decoder.get(), stream->codecpar),
                "h264-parameters-invalid");
  decoder->thread_count = std::clamp(decoderThreads, 1, 16);
  decoder->thread_type = FF_THREAD_FRAME | FF_THREAD_SLICE;
  RequireStatus(avcodec_open2(decoder.get(), codec, nullptr), "h264-decoder-open-failed");
  const AVRational frameRate = av_guess_frame_rate(format.get(), stream, nullptr);
  const double fps = av_q2d(frameRate);
  if (!std::isfinite(fps) || fps <= 0 || fps > 1000 || decoder->width < 2 || decoder->height < 2) {
    FSProviderFail("source-metadata-invalid");
  }
  if (sampleFps > fps * 2) FSProviderFail("sample-rate-invalid");

  const std::int64_t streamOrigin = stream->start_time == AV_NOPTS_VALUE ? 0 : stream->start_time;
  const std::int64_t targetTimestamp = streamOrigin + av_rescale_q(
      startMs, AVRational{1, 1000}, stream->time_base);
  if (startMs > 0) {
    RequireStatus(avformat_seek_file(
        format.get(), streamIndex, std::numeric_limits<std::int64_t>::min(),
        targetTimestamp, targetTimestamp, AVSEEK_FLAG_BACKWARD), "source-seek-failed");
    avcodec_flush_buffers(decoder.get());
  }

  PacketPointer packet(av_packet_alloc());
  FramePointer frame(av_frame_alloc());
  if (!packet || !frame) FSProviderFail("decode-buffer-allocation-failed");
  ScalerPointer scaler(nullptr);
  const double sampleStepMs = 1000.0 / sampleFps;
  double nextSampleMs = startMs;
  double lastFrameMs = -1;
  std::int64_t decodedFrames = 0;
  std::int64_t emittedFrames = 0;
  bool complete = false;

  auto receiveFrames = [&]() {
    while (!complete) {
      const int status = avcodec_receive_frame(decoder.get(), frame.get());
      if (status == AVERROR(EAGAIN) || status == AVERROR_EOF) return;
      RequireStatus(status, "h264-frame-decode-failed");
      const double frameMs = FrameTimeMs(frame.get(), stream, decodedFrames, fps);
      decodedFrames += 1;
      lastFrameMs = std::max(lastFrameMs, frameMs);
      if (decodedFrames > maximumFrames + std::llround(fps * 5)) {
        FSProviderFail("source-frame-limit-exceeded");
      }
      const bool beforeRangeEnd = frameMs + 0.5 < endMs;
      if (frameMs + 0.5 >= nextSampleMs && beforeRangeEnd) {
        FSDecodedFrame value;
        value.tensor = PreprocessFrame(frame.get(), &value.ratio, &scaler);
        value.width = frame->width;
        value.height = frame->height;
        value.atMs = std::clamp<std::int64_t>(std::llround(frameMs), startMs, endMs);
        value.frameIndex = std::max<std::int64_t>(
            0, std::llround((frameMs - startMs) * fps / 1000.0));
        if (value.frameIndex >= maximumFrames) FSProviderFail("source-frame-limit-exceeded");
        handler(std::move(value));
        emittedFrames += 1;
        do nextSampleMs += sampleStepMs; while (nextSampleMs <= frameMs + 0.5);
      }
      if (!beforeRangeEnd) complete = true;
      av_frame_unref(frame.get());
    }
  };

  while (!complete) {
    const int readStatus = av_read_frame(format.get(), packet.get());
    if (readStatus == AVERROR_EOF) break;
    RequireStatus(readStatus, "source-read-failed");
    if (packet->stream_index == streamIndex) {
      int sendStatus = avcodec_send_packet(decoder.get(), packet.get());
      if (sendStatus == AVERROR(EAGAIN)) {
        receiveFrames();
        sendStatus = avcodec_send_packet(decoder.get(), packet.get());
      }
      RequireStatus(sendStatus, "h264-packet-decode-failed");
      receiveFrames();
    }
    av_packet_unref(packet.get());
  }
  if (!complete) {
    const int flushStatus = avcodec_send_packet(decoder.get(), nullptr);
    if (flushStatus != AVERROR_EOF) RequireStatus(flushStatus, "h264-flush-failed");
    receiveFrames();
  }
  if (!emittedFrames || lastFrameMs < endMs - std::max(1000.0, 2000.0 / fps)) {
    FSProviderFail("source-ended-before-request");
  }
}
