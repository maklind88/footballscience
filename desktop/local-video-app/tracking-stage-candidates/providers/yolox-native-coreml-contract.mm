#import <CommonCrypto/CommonDigest.h>
#import <Foundation/Foundation.h>
#import <mach-o/dyld.h>

#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

#include <algorithm>
#include <cerrno>
#include <cstdlib>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>

#include "yolox-native-coreml-provider.hpp"

namespace {

constexpr std::size_t kMaximumInvocationBytes = 64 * 1024 * 1024;
constexpr std::size_t kMaximumManifestBytes = 2 * 1024 * 1024;
constexpr char kInvocationProtocol[] = "football-science-tracking-stage-invocation-v1";
constexpr char kRequestProtocol[] = "football-science-tracking-stage-request-v1";
constexpr char kResultProtocol[] = "football-science-tracking-stage-result-v1";
constexpr char kModelId[] = "yolox-s-coco-onnx";
constexpr char kModelSha256[] = "c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063";

std::string ErrorText(const char* action) {
  return std::string(action) + ": " + std::strerror(errno);
}

bool SameStat(const struct stat& first, const struct stat& second) {
  return first.st_dev == second.st_dev && first.st_ino == second.st_ino &&
      first.st_size == second.st_size &&
      first.st_mtimespec.tv_sec == second.st_mtimespec.tv_sec &&
      first.st_mtimespec.tv_nsec == second.st_mtimespec.tv_nsec &&
      first.st_ctimespec.tv_sec == second.st_ctimespec.tv_sec &&
      first.st_ctimespec.tv_nsec == second.st_ctimespec.tv_nsec;
}

int OpenRegularFile(NSString* path, std::size_t maximumBytes, struct stat* initialStat) {
  const char* filePath = path.fileSystemRepresentation;
  struct stat pathStat{};
  if (lstat(filePath, &pathStat) != 0) FSProviderFail(ErrorText("lstat failed"));
  if (!S_ISREG(pathStat.st_mode) || S_ISLNK(pathStat.st_mode) || pathStat.st_size < 1 ||
      static_cast<std::uint64_t>(pathStat.st_size) > maximumBytes) {
    FSProviderFail("bounded-regular-file-required");
  }
  const int fd = open(filePath, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
  if (fd < 0) FSProviderFail(ErrorText("open failed"));
  struct stat descriptorStat{};
  if (fstat(fd, &descriptorStat) != 0 || !SameStat(pathStat, descriptorStat)) {
    close(fd);
    FSProviderFail("file-changed-before-read");
  }
  *initialStat = descriptorStat;
  return fd;
}

NSData* ReadRegularFile(NSString* path, std::size_t maximumBytes) {
  struct stat initialStat{};
  const int fd = OpenRegularFile(path, maximumBytes, &initialStat);
  NSMutableData* data = [NSMutableData dataWithLength:static_cast<NSUInteger>(initialStat.st_size)];
  std::size_t offset = 0;
  while (offset < data.length) {
    const ssize_t count = pread(
        fd, static_cast<std::uint8_t*>(data.mutableBytes) + offset, data.length - offset,
        static_cast<off_t>(offset));
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) {
      close(fd);
      FSProviderFail(count == 0 ? "file-ended-during-read" : ErrorText("read failed"));
    }
    offset += static_cast<std::size_t>(count);
  }
  struct stat finalStat{};
  const bool unchanged = fstat(fd, &finalStat) == 0 && SameStat(initialStat, finalStat);
  close(fd);
  if (!unchanged) FSProviderFail("file-changed-during-read");
  return data;
}

NSString* Sha256Data(NSData* data) {
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(data.bytes, static_cast<CC_LONG>(data.length), digest);
  NSMutableString* value = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
  for (unsigned char byte : digest) [value appendFormat:@"%02x", byte];
  return value;
}

NSString* Sha256File(NSString* path, std::size_t maximumBytes) {
  struct stat initialStat{};
  const int fd = OpenRegularFile(path, maximumBytes, &initialStat);
  CC_SHA256_CTX context;
  CC_SHA256_Init(&context);
  std::vector<std::uint8_t> buffer(1024 * 1024);
  off_t offset = 0;
  while (offset < initialStat.st_size) {
    const ssize_t count = pread(fd, buffer.data(), std::min<off_t>(
        buffer.size(), initialStat.st_size - offset), offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) {
      close(fd);
      FSProviderFail(count == 0 ? "file-ended-during-hash" : ErrorText("hash-read-failed"));
    }
    CC_SHA256_Update(&context, buffer.data(), static_cast<CC_LONG>(count));
    offset += count;
  }
  struct stat finalStat{};
  const bool unchanged = fstat(fd, &finalStat) == 0 && SameStat(initialStat, finalStat);
  close(fd);
  if (!unchanged) FSProviderFail("file-changed-during-hash");
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256_Final(digest, &context);
  NSMutableString* value = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
  for (unsigned char byte : digest) [value appendFormat:@"%02x", byte];
  return value;
}

NSDictionary* LoadJson(NSString* path, std::size_t maximumBytes) {
  NSError* error = nil;
  id value = [NSJSONSerialization JSONObjectWithData:ReadRegularFile(path, maximumBytes)
                                              options:0 error:&error];
  if (error || ![value isKindOfClass:NSDictionary.class]) FSProviderFail("json-invalid");
  return value;
}

void ExactKeys(NSDictionary* value, NSArray<NSString*>* keys, const char* label) {
  NSSet* actual = [NSSet setWithArray:value.allKeys];
  NSSet* expected = [NSSet setWithArray:keys];
  if (![actual isEqualToSet:expected]) FSProviderFail(std::string(label) + "-invalid");
}

NSData* CanonicalJson(id value) {
  NSError* error = nil;
  NSData* encoded = [NSJSONSerialization dataWithJSONObject:value
      options:NSJSONWritingSortedKeys | NSJSONWritingWithoutEscapingSlashes error:&error];
  if (error || !encoded) FSProviderFail("canonical-json-invalid");
  return encoded;
}

NSString* ExecutablePath() {
  uint32_t bytes = 0;
  _NSGetExecutablePath(nullptr, &bytes);
  std::vector<char> buffer(bytes + 1, 0);
  if (_NSGetExecutablePath(buffer.data(), &bytes) != 0) FSProviderFail("executable-path-invalid");
  char* resolved = realpath(buffer.data(), nullptr);
  if (!resolved) FSProviderFail(ErrorText("executable-realpath-failed"));
  NSString* value = [NSString stringWithUTF8String:resolved];
  std::free(resolved);
  return value;
}

NSArray<NSString*>* SortedCapabilities(NSDictionary* manifest) {
  id raw = manifest[@"capabilities"];
  if (![raw isKindOfClass:NSArray.class]) FSProviderFail("manifest-capabilities-invalid");
  for (id value in raw) {
    if (![value isKindOfClass:NSString.class]) FSProviderFail("manifest-capabilities-invalid");
  }
  return [raw sortedArrayUsingSelector:@selector(compare:)];
}

NSString* ProviderFingerprint(NSDictionary* manifest, NSArray<NSString*>* capabilities) {
  NSDictionary* runtime = manifest[@"runtime"];
  NSArray* runtimeKeys = @[@"providerSha256", @"maxFrames", @"maxDurationMs", @"maxWallTimeMs",
      @"maxMemoryMb", @"maxOutputBytes", @"maxConcurrentJobs", @"device", @"runtimeMode",
      @"cpuThreads", @"sampleFps", @"modelResident"];
  NSMutableDictionary* runtimePayload = [NSMutableDictionary dictionary];
  for (NSString* key in runtimeKeys) {
    if (!runtime[key]) FSProviderFail("manifest-runtime-invalid");
    runtimePayload[key] = runtime[key];
  }
  NSDictionary* payload = @{
    @"schemaVersion": manifest[@"schemaVersion"], @"protocol": manifest[@"protocol"],
    @"providerId": manifest[@"providerId"], @"providerVersion": manifest[@"providerVersion"],
    @"displayName": manifest[@"displayName"], @"stage": manifest[@"stage"],
    @"priority": manifest[@"priority"], @"capabilities": capabilities,
    @"upstream": manifest[@"upstream"], @"models": manifest[@"models"],
    @"runtime": runtimePayload,
  };
  return Sha256Data(CanonicalJson(payload));
}

NSString* RequestFingerprint(const FSProviderInvocation& invocation) {
  NSDictionary* manifest = invocation.manifest;
  NSDictionary* provider = @{
    @"id": manifest[@"providerId"], @"version": manifest[@"providerVersion"],
    @"fingerprintSha256": invocation.providerFingerprint,
  };
  NSDictionary* payload = @{
    @"schemaVersion": @1, @"protocol": @(kRequestProtocol), @"provider": provider,
    @"stage": manifest[@"stage"], @"capabilities": invocation.capabilities,
    @"sourceFingerprint": invocation.request[@"sourceFingerprint"],
    @"range": invocation.request[@"range"],
  };
  return Sha256Data(CanonicalJson(payload));
}

void WriteAll(int fd, NSData* data) {
  std::size_t offset = 0;
  while (offset < data.length) {
    const ssize_t count = write(fd, static_cast<const std::uint8_t*>(data.bytes) + offset,
                                data.length - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) FSProviderFail(ErrorText("output-write-failed"));
    offset += static_cast<std::size_t>(count);
  }
}

}  // namespace

[[noreturn]] void FSProviderFail(const std::string& message) {
  throw std::runtime_error(message);
}

FSProviderInvocation FSLoadProviderInvocation(int argc, char** argv) {
  if (std::getenv("FS_TRACKING_NETWORK_DISABLED") == nullptr ||
      std::strcmp(std::getenv("FS_TRACKING_NETWORK_DISABLED"), "1") != 0) {
    FSProviderFail("network-boundary-missing");
  }
  NSString* invocationPath = nil;
  NSString* outputPath = nil;
  for (int index = 1; index < argc; index += 1) {
    std::string argument(argv[index]);
    if ((argument == "--fs-tracking-stage-invocation" ||
         argument == "--fs-tracking-stage-output") && index + 1 < argc) {
      NSString* value = [NSString stringWithUTF8String:argv[++index]];
      if (argument == "--fs-tracking-stage-invocation" && !invocationPath) invocationPath = value;
      else if (argument == "--fs-tracking-stage-output" && !outputPath) outputPath = value;
      else FSProviderFail("arguments-invalid");
    } else FSProviderFail("arguments-invalid");
  }
  if (!invocationPath || !outputPath) FSProviderFail("arguments-invalid");

  NSString* providerDir = [[ExecutablePath() stringByDeletingLastPathComponent]
      stringByDeletingLastPathComponent];
  NSDictionary* manifest = LoadJson([providerDir stringByAppendingPathComponent:@"manifest.json"],
                                    kMaximumManifestBytes);
  if (![manifest[@"schemaVersion"] isEqual:@1] ||
      ![manifest[@"protocol"] isEqual:@"football-science-tracking-stage-v1"] ||
      ![manifest[@"stage"] isEqual:@"detection"] ||
      ![manifest[@"approval"][@"status"] isEqual:@"candidate"] ||
      ![manifest[@"approval"][@"networkAtInference"] isEqual:@NO]) {
    FSProviderFail("manifest-scope-invalid");
  }

  NSDictionary* invocation = LoadJson(invocationPath, kMaximumInvocationBytes);
  ExactKeys(invocation, @[@"schemaVersion", @"protocol", @"provider", @"request", @"source",
                          @"models", @"output"], "invocation");
  if (![invocation[@"schemaVersion"] isEqual:@1] ||
      ![invocation[@"protocol"] isEqual:@(kInvocationProtocol)]) {
    FSProviderFail("invocation-protocol-invalid");
  }
  NSDictionary* expectedProvider = @{
    @"id": manifest[@"providerId"], @"version": manifest[@"providerVersion"],
    @"stage": manifest[@"stage"],
  };
  if (![invocation[@"provider"] isEqual:expectedProvider]) FSProviderFail("invocation-provider-mismatch");

  NSDictionary* source = invocation[@"source"];
  if (![source isKindOfClass:NSDictionary.class]) FSProviderFail("source-invalid");
  ExactKeys(source, @[@"filePath", @"sha256"], "source");
  NSString* sourcePath = source[@"filePath"];
  struct stat sourceStat{};
  const int sourceFd = OpenRegularFile(sourcePath, SIZE_MAX, &sourceStat);
  close(sourceFd);

  NSArray* models = invocation[@"models"];
  if (![models isKindOfClass:NSArray.class] || models.count != 1) FSProviderFail("model-set-invalid");
  NSDictionary* model = models.firstObject;
  ExactKeys(model, @[@"id", @"filePath", @"bytes", @"sha256"], "model");
  if (![model[@"id"] isEqual:@(kModelId)] || ![model[@"sha256"] isEqual:@(kModelSha256)]) {
    FSProviderFail("model-set-invalid");
  }
  NSString* modelPath = model[@"filePath"];
  if (![[Sha256File(modelPath, 1024ULL * 1024 * 1024) lowercaseString] isEqual:@(kModelSha256)]) {
    FSProviderFail("model-checksum-mismatch");
  }

  NSDictionary* output = invocation[@"output"];
  ExactKeys(output, @[@"filePath", @"maximumBytes"], "output");
  if (![[output[@"filePath"] stringByStandardizingPath]
          isEqual:[outputPath stringByStandardizingPath]]) FSProviderFail("output-path-mismatch");
  const auto requestedBytes = static_cast<std::size_t>([output[@"maximumBytes"] unsignedLongLongValue]);
  const auto providerBytes = static_cast<std::size_t>(
      [manifest[@"runtime"][@"maxOutputBytes"] unsignedLongLongValue]);
  if (!requestedBytes || !providerBytes) FSProviderFail("output-limit-invalid");

  NSArray<NSString*>* capabilities = SortedCapabilities(manifest);
  FSProviderInvocation value;
  value.manifest = manifest;
  value.request = invocation[@"request"];
  value.capabilities = capabilities;
  value.sourcePath = sourcePath;
  value.modelPath = modelPath;
  value.outputPath = outputPath;
  value.providerFingerprint = ProviderFingerprint(manifest, capabilities);
  value.maximumOutputBytes = std::min(requestedBytes, providerBytes);
  return value;
}

void FSWriteProviderResult(
    const FSProviderInvocation& invocation,
    NSArray<NSDictionary*>* observations) {
  NSDictionary* result = @{
    @"schemaVersion": @1, @"protocol": @(kResultProtocol),
    @"provider": @{
      @"id": invocation.manifest[@"providerId"],
      @"version": invocation.manifest[@"providerVersion"],
      @"fingerprintSha256": invocation.providerFingerprint,
    },
    @"stage": invocation.manifest[@"stage"], @"capabilities": invocation.capabilities,
    @"sourceFingerprint": invocation.request[@"sourceFingerprint"],
    @"requestFingerprint": RequestFingerprint(invocation),
    @"range": invocation.request[@"range"], @"payload": @{@"observations": observations},
  };
  NSMutableData* encoded = [CanonicalJson(result) mutableCopy];
  const std::uint8_t newline = '\n';
  [encoded appendBytes:&newline length:1];
  if (!encoded.length || encoded.length > invocation.maximumOutputBytes) {
    FSProviderFail("result-size-invalid");
  }
  NSString* temporary = [[invocation.outputPath stringByDeletingPathExtension]
      stringByAppendingPathExtension:@"tmp"];
  const int fd = open(temporary.fileSystemRepresentation,
                      O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW, 0600);
  if (fd < 0) FSProviderFail(ErrorText("output-open-failed"));
  try {
    WriteAll(fd, encoded);
    if (fsync(fd) != 0) FSProviderFail(ErrorText("output-fsync-failed"));
    if (close(fd) != 0) FSProviderFail(ErrorText("output-close-failed"));
  } catch (...) {
    close(fd);
    unlink(temporary.fileSystemRepresentation);
    throw;
  }
  if (renamex_np(temporary.fileSystemRepresentation, invocation.outputPath.fileSystemRepresentation,
                 RENAME_EXCL) != 0) {
    unlink(temporary.fileSystemRepresentation);
    FSProviderFail(ErrorText("output-rename-failed"));
  }
}
