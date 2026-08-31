#import <CommonCrypto/CommonDigest.h>
#import <CoreFoundation/CoreFoundation.h>
#import <Foundation/Foundation.h>
#import <mach-o/dyld.h>

#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

#include <algorithm>
#include <cerrno>
#include <climits>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <stdexcept>
#include <string>
#include <unordered_set>
#include <vector>

#include "bytetrack-native-provider.hpp"
#include "ryu/ryu.h"

namespace {

constexpr std::size_t kMaximumInvocationBytes = 64 * 1024 * 1024;
constexpr std::size_t kMaximumManifestBytes = 2 * 1024 * 1024;
constexpr char kInvocationProtocol[] = "football-science-tracking-stage-invocation-v1";
constexpr char kResultProtocol[] = "football-science-tracking-stage-result-v1";

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
  if (lstat(filePath, &pathStat) != 0) FSByteTrackFail(ErrorText("lstat failed"));
  if (!S_ISREG(pathStat.st_mode) || S_ISLNK(pathStat.st_mode) || pathStat.st_size < 1 ||
      static_cast<std::uint64_t>(pathStat.st_size) > maximumBytes) {
    FSByteTrackFail("bounded-regular-file-required");
  }
  const int fd = open(filePath, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
  if (fd < 0) FSByteTrackFail(ErrorText("open failed"));
  struct stat descriptorStat{};
  if (fstat(fd, &descriptorStat) != 0 || !SameStat(pathStat, descriptorStat)) {
    close(fd);
    FSByteTrackFail("file-changed-before-read");
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
        fd, static_cast<std::uint8_t*>(data.mutableBytes) + offset,
        data.length - offset, static_cast<off_t>(offset));
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) {
      close(fd);
      FSByteTrackFail(count == 0 ? "file-ended-during-read" : ErrorText("read failed"));
    }
    offset += static_cast<std::size_t>(count);
  }
  struct stat finalStat{};
  const bool unchanged = fstat(fd, &finalStat) == 0 && SameStat(initialStat, finalStat);
  close(fd);
  if (!unchanged) FSByteTrackFail("file-changed-during-read");
  return data;
}

NSDictionary* LoadJson(NSString* path, std::size_t maximumBytes) {
  NSError* error = nil;
  id value = [NSJSONSerialization JSONObjectWithData:ReadRegularFile(path, maximumBytes)
                                              options:0 error:&error];
  if (error || ![value isKindOfClass:NSDictionary.class]) FSByteTrackFail("json-invalid");
  return value;
}

void ExactKeys(NSDictionary* value, NSArray<NSString*>* keys, const char* label) {
  if (![value isKindOfClass:NSDictionary.class]) FSByteTrackFail(std::string(label) + "-invalid");
  if (![[NSSet setWithArray:value.allKeys] isEqualToSet:[NSSet setWithArray:keys]]) {
    FSByteTrackFail(std::string(label) + "-invalid");
  }
}

std::string JsonString(NSString* value) {
  NSError* error = nil;
  NSData* encoded = [NSJSONSerialization dataWithJSONObject:value
      options:NSJSONWritingFragmentsAllowed | NSJSONWritingWithoutEscapingSlashes error:&error];
  if (error || !encoded) FSByteTrackFail("canonical-json-string-invalid");
  return std::string(static_cast<const char*>(encoded.bytes), encoded.length);
}

std::string EcmaNumber(NSNumber* value) {
  if (CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()) {
    return value.boolValue ? "true" : "false";
  }
  const double number = value.doubleValue;
  if (!std::isfinite(number)) FSByteTrackFail("canonical-json-number-invalid");
  if (number == 0) return "0";
  const bool negative = number < 0;
  char buffer[32];
  const int written = d2s_buffered_n(std::abs(number), buffer);
  if (written < 3 || written >= static_cast<int>(sizeof(buffer))) {
    FSByteTrackFail("canonical-json-number-invalid");
  }
  const std::string shortest(buffer, static_cast<std::size_t>(written));
  const std::size_t exponentOffset = shortest.find('E');
  if (exponentOffset == std::string::npos) FSByteTrackFail("canonical-json-number-invalid");
  std::string digits = shortest.substr(0, exponentOffset);
  digits.erase(std::remove(digits.begin(), digits.end(), '.'), digits.end());
  const int decimalPosition = std::stoi(shortest.substr(exponentOffset + 1)) + 1;
  std::string output;
  if (decimalPosition > 0 && decimalPosition <= 21) {
    if (static_cast<int>(digits.size()) <= decimalPosition) {
      output = digits + std::string(decimalPosition - digits.size(), '0');
    } else {
      output = digits.substr(0, decimalPosition) + "." + digits.substr(decimalPosition);
    }
  } else if (decimalPosition <= 0 && decimalPosition > -6) {
    output = "0." + std::string(-decimalPosition, '0') + digits;
  } else {
    output = digits.substr(0, 1);
    if (digits.size() > 1) output += "." + digits.substr(1);
    const int exponent = decimalPosition - 1;
    output += exponent >= 0 ? "e+" : "e-";
    output += std::to_string(std::abs(exponent));
  }
  return negative ? "-" + output : output;
}

void AppendCanonical(id value, std::string* output) {
  if (value == NSNull.null) output->append("null");
  else if ([value isKindOfClass:NSString.class]) output->append(JsonString(value));
  else if ([value isKindOfClass:NSNumber.class]) output->append(EcmaNumber(value));
  else if ([value isKindOfClass:NSArray.class]) {
    output->push_back('[');
    bool first = true;
    for (id entry in value) {
      if (!first) output->push_back(',');
      AppendCanonical(entry, output);
      first = false;
    }
    output->push_back(']');
  } else if ([value isKindOfClass:NSDictionary.class]) {
    output->push_back('{');
    bool first = true;
    NSArray<NSString*>* keys = [[value allKeys] sortedArrayUsingSelector:@selector(compare:)];
    for (NSString* key in keys) {
      if (![key isKindOfClass:NSString.class]) FSByteTrackFail("canonical-json-key-invalid");
      if (!first) output->push_back(',');
      output->append(JsonString(key));
      output->push_back(':');
      AppendCanonical([value objectForKey:key], output);
      first = false;
    }
    output->push_back('}');
  } else FSByteTrackFail("canonical-json-value-invalid");
}

NSData* CanonicalJson(id value) {
  std::string encoded;
  AppendCanonical(value, &encoded);
  return [NSData dataWithBytes:encoded.data() length:encoded.size()];
}

NSString* Sha256Data(NSData* data) {
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(data.bytes, static_cast<CC_LONG>(data.length), digest);
  NSMutableString* value = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
  for (unsigned char byte : digest) [value appendFormat:@"%02x", byte];
  return value;
}

NSString* ExecutablePath() {
  uint32_t bytes = 0;
  _NSGetExecutablePath(nullptr, &bytes);
  std::vector<char> buffer(bytes + 1, 0);
  if (_NSGetExecutablePath(buffer.data(), &bytes) != 0) FSByteTrackFail("executable-path-invalid");
  char* resolved = realpath(buffer.data(), nullptr);
  if (!resolved) FSByteTrackFail(ErrorText("executable-realpath-failed"));
  NSString* value = [NSString stringWithUTF8String:resolved];
  std::free(resolved);
  return value;
}

bool FiniteNumber(id value, double minimum, double maximum) {
  if (![value isKindOfClass:NSNumber.class] ||
      CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()) return false;
  const double number = [value doubleValue];
  return std::isfinite(number) && number >= minimum && number <= maximum;
}

bool IntegerNumber(id value, long long minimum, long long maximum) {
  if (!FiniteNumber(value, static_cast<double>(minimum), static_cast<double>(maximum))) return false;
  const double number = [value doubleValue];
  return std::floor(number) == number;
}

bool Identifier(NSString* value) {
  if (![value isKindOfClass:NSString.class] || value.length < 1 || value.length > 160) return false;
  NSCharacterSet* allowed = [NSCharacterSet characterSetWithCharactersInString:
      @"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-"];
  return [value rangeOfCharacterFromSet:allowed.invertedSet].location == NSNotFound &&
      [[NSCharacterSet alphanumericCharacterSet] characterIsMember:[value characterAtIndex:0]];
}

bool Sha256String(NSString* value) {
  if (![value isKindOfClass:NSString.class] || value.length != 64) return false;
  NSCharacterSet* allowed = [NSCharacterSet characterSetWithCharactersInString:@"0123456789abcdef"];
  return [value rangeOfCharacterFromSet:allowed.invertedSet].location == NSNotFound;
}

NSArray<NSString*>* ValidateRequest(NSDictionary* request, NSDictionary* manifest) {
  ExactKeys(request, @[@"sourceFingerprint", @"range", @"observations"], "request");
  NSString* source = request[@"sourceFingerprint"];
  if (![source isKindOfClass:NSString.class] || source.length != 64) FSByteTrackFail("source-invalid");
  ExactKeys(request[@"range"], @[@"startMs", @"endMs"], "range");
  const long long startMs = [request[@"range"][@"startMs"] longLongValue];
  const long long endMs = [request[@"range"][@"endMs"] longLongValue];
  if (!IntegerNumber(request[@"range"][@"startMs"], 0, LLONG_MAX) ||
      !IntegerNumber(request[@"range"][@"endMs"], 1, LLONG_MAX) || endMs <= startMs ||
      endMs - startMs > [manifest[@"runtime"][@"maxDurationMs"] longLongValue]) {
    FSByteTrackFail("range-invalid");
  }
  NSArray* observations = request[@"observations"];
  if (![observations isKindOfClass:NSArray.class] || observations.count > 250000) {
    FSByteTrackFail("observations-invalid");
  }
  std::unordered_set<std::string> ids;
  for (id raw in observations) {
    NSDictionary* value = raw;
    ExactKeys(value, @[@"id", @"atMs", @"frameIndex", @"entityType", @"box", @"confidence"],
              "observation");
    NSString* identifier = value[@"id"];
    NSString* entity = value[@"entityType"];
    if (!Identifier(identifier) ||
        (! [entity isEqual:@"player"] && ![entity isEqual:@"ball"] && ![entity isEqual:@"referee"]) ||
        !ids.insert(identifier.UTF8String).second ||
        !IntegerNumber(value[@"atMs"], startMs, endMs) ||
        !IntegerNumber(value[@"frameIndex"], 0,
                       [manifest[@"runtime"][@"maxFrames"] longLongValue] - 1) ||
        !FiniteNumber(value[@"confidence"], 0, 1)) {
      FSByteTrackFail("observation-invalid");
    }
    NSDictionary* box = value[@"box"];
    ExactKeys(box, @[@"left", @"top", @"width", @"height"], "box");
    if (!FiniteNumber(box[@"left"], 0, 1) || !FiniteNumber(box[@"top"], 0, 1) ||
        !FiniteNumber(box[@"width"], 0, 1) || !FiniteNumber(box[@"height"], 0, 1) ||
        [box[@"width"] doubleValue] <= 0 || [box[@"height"] doubleValue] <= 0 ||
        [box[@"left"] doubleValue] + [box[@"width"] doubleValue] > 1 ||
        [box[@"top"] doubleValue] + [box[@"height"] doubleValue] > 1) {
      FSByteTrackFail("box-invalid");
    }
  }
  return observations;
}

NSArray<NSString*>* SortedCapabilities(NSDictionary* manifest) {
  id raw = manifest[@"capabilities"];
  if (![raw isKindOfClass:NSArray.class]) FSByteTrackFail("manifest-capabilities-invalid");
  for (id value in raw) if (![value isKindOfClass:NSString.class]) FSByteTrackFail("manifest-capabilities-invalid");
  NSArray* sorted = [raw sortedArrayUsingSelector:@selector(compare:)];
  if (![sorted isEqual:@[@"associate:multi-object"]]) FSByteTrackFail("manifest-capabilities-invalid");
  return sorted;
}

NSString* ProviderFingerprint(NSDictionary* manifest, NSArray<NSString*>* capabilities) {
  NSDictionary* runtime = manifest[@"runtime"];
  NSArray* runtimeKeys = @[@"providerSha256", @"maxFrames", @"maxDurationMs", @"maxWallTimeMs",
      @"maxMemoryMb", @"maxOutputBytes", @"maxConcurrentJobs", @"device", @"runtimeMode",
      @"cpuThreads", @"sampleFps", @"modelResident"];
  NSMutableDictionary* runtimePayload = [NSMutableDictionary dictionary];
  for (NSString* key in runtimeKeys) {
    if (!runtime[key]) FSByteTrackFail("manifest-runtime-invalid");
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

void WriteAll(int fd, NSData* data) {
  std::size_t offset = 0;
  while (offset < data.length) {
    const ssize_t count = write(fd, static_cast<const std::uint8_t*>(data.bytes) + offset,
                                data.length - offset);
    if (count < 0 && errno == EINTR) continue;
    if (count <= 0) FSByteTrackFail(ErrorText("output-write-failed"));
    offset += static_cast<std::size_t>(count);
  }
}

}  // namespace

[[noreturn]] void FSByteTrackFail(const std::string& message) {
  throw std::runtime_error(message);
}

FSByteTrackInvocation FSLoadByteTrackInvocation(int argc, char** argv) {
  if (std::getenv("FS_TRACKING_NETWORK_DISABLED") == nullptr ||
      std::strcmp(std::getenv("FS_TRACKING_NETWORK_DISABLED"), "1") != 0) {
    FSByteTrackFail("network-boundary-missing");
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
      else FSByteTrackFail("arguments-invalid");
    } else FSByteTrackFail("arguments-invalid");
  }
  if (!invocationPath || !outputPath) FSByteTrackFail("arguments-invalid");

  NSString* providerDir = [[ExecutablePath() stringByDeletingLastPathComponent]
      stringByDeletingLastPathComponent];
  NSDictionary* manifest = LoadJson([providerDir stringByAppendingPathComponent:@"manifest.json"],
                                    kMaximumManifestBytes);
  if (![manifest[@"schemaVersion"] isEqual:@1] ||
      ![manifest[@"protocol"] isEqual:@"football-science-tracking-stage-v1"] ||
      ![manifest[@"stage"] isEqual:@"association"] ||
      ![manifest[@"approval"][@"status"] isEqual:@"candidate"] ||
      ![manifest[@"approval"][@"networkAtInference"] isEqual:@NO] ||
      ![manifest[@"models"] isKindOfClass:NSArray.class] || [manifest[@"models"] count] != 0) {
    FSByteTrackFail("manifest-scope-invalid");
  }

  NSDictionary* invocation = LoadJson(invocationPath, kMaximumInvocationBytes);
  ExactKeys(invocation, @[@"schemaVersion", @"protocol", @"provider", @"request",
                          @"requestFingerprint", @"source", @"models", @"output"], "invocation");
  if (![invocation[@"schemaVersion"] isEqual:@1] ||
      ![invocation[@"protocol"] isEqual:@(kInvocationProtocol)]) FSByteTrackFail("invocation-protocol-invalid");
  NSDictionary* expectedProvider = @{
    @"id": manifest[@"providerId"], @"version": manifest[@"providerVersion"],
    @"stage": manifest[@"stage"],
  };
  if (![invocation[@"provider"] isEqual:expectedProvider]) FSByteTrackFail("invocation-provider-mismatch");
  if (invocation[@"source"] != NSNull.null || ![invocation[@"models"] isKindOfClass:NSArray.class] ||
      [invocation[@"models"] count] != 0) FSByteTrackFail("invocation-artifact-set-invalid");

  NSDictionary* request = invocation[@"request"];
  ValidateRequest(request, manifest);
  NSString* requestFingerprint = invocation[@"requestFingerprint"];
  if (!Sha256String(requestFingerprint)) FSByteTrackFail("request-fingerprint-invalid");
  NSDictionary* output = invocation[@"output"];
  ExactKeys(output, @[@"filePath", @"maximumBytes"], "output");
  if (![[output[@"filePath"] stringByStandardizingPath]
          isEqual:[outputPath stringByStandardizingPath]]) FSByteTrackFail("output-path-mismatch");
  const auto requestedBytes = static_cast<std::size_t>([output[@"maximumBytes"] unsignedLongLongValue]);
  const auto providerBytes = static_cast<std::size_t>(
      [manifest[@"runtime"][@"maxOutputBytes"] unsignedLongLongValue]);
  const double sampleFps = [manifest[@"runtime"][@"sampleFps"] doubleValue];
  if (!requestedBytes || !providerBytes || !std::isfinite(sampleFps) || sampleFps <= 0 || sampleFps > 240) {
    FSByteTrackFail("runtime-limits-invalid");
  }

  NSArray<NSString*>* capabilities = SortedCapabilities(manifest);
  return FSByteTrackInvocation{
    manifest, request, capabilities, outputPath,
    ProviderFingerprint(manifest, capabilities), requestFingerprint,
    std::min(requestedBytes, providerBytes), sampleFps,
  };
}

void FSWriteByteTrackResult(
    const FSByteTrackInvocation& invocation,
    NSArray<NSDictionary*>* trajectories) {
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
    @"range": invocation.request[@"range"], @"payload": @{@"trajectories": trajectories},
  };
  NSMutableData* encoded = [CanonicalJson(result) mutableCopy];
  const std::uint8_t newline = '\n';
  [encoded appendBytes:&newline length:1];
  if (!encoded.length || encoded.length > invocation.maximumOutputBytes) FSByteTrackFail("result-size-invalid");
  NSString* temporary = [[invocation.outputPath stringByDeletingPathExtension]
      stringByAppendingPathExtension:@"tmp"];
  const int fd = open(temporary.fileSystemRepresentation,
                      O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW, 0600);
  if (fd < 0) FSByteTrackFail(ErrorText("output-open-failed"));
  try {
    WriteAll(fd, encoded);
    if (fsync(fd) != 0) FSByteTrackFail(ErrorText("output-fsync-failed"));
    if (close(fd) != 0) FSByteTrackFail(ErrorText("output-close-failed"));
  } catch (...) {
    close(fd);
    unlink(temporary.fileSystemRepresentation);
    throw;
  }
  if (renamex_np(temporary.fileSystemRepresentation, invocation.outputPath.fileSystemRepresentation,
                 RENAME_EXCL) != 0) {
    unlink(temporary.fileSystemRepresentation);
    FSByteTrackFail(ErrorText("output-rename-failed"));
  }
}
