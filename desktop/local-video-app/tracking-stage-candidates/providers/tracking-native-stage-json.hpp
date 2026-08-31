#pragma once

#import <CommonCrypto/CommonDigest.h>
#import <CoreFoundation/CoreFoundation.h>
#import <Foundation/Foundation.h>
#import <mach-o/dyld.h>

#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

#include <algorithm>
#include <cerrno>
#include <cmath>
#include <cstdlib>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>

namespace fs_tracking_native {

inline std::string ErrorText(const char* action) {
  return std::string(action) + ": " + std::strerror(errno);
}

inline bool SameStat(const struct stat& first, const struct stat& second) {
  return first.st_dev == second.st_dev && first.st_ino == second.st_ino &&
      first.st_size == second.st_size &&
      first.st_mtimespec.tv_sec == second.st_mtimespec.tv_sec &&
      first.st_mtimespec.tv_nsec == second.st_mtimespec.tv_nsec &&
      first.st_ctimespec.tv_sec == second.st_ctimespec.tv_sec &&
      first.st_ctimespec.tv_nsec == second.st_ctimespec.tv_nsec;
}

inline int OpenRegularFile(NSString* path, std::size_t maximumBytes, struct stat* initialStat) {
  const char* filePath = path.fileSystemRepresentation;
  struct stat pathStat{};
  if (lstat(filePath, &pathStat) != 0) throw std::runtime_error(ErrorText("lstat failed"));
  if (!S_ISREG(pathStat.st_mode) || S_ISLNK(pathStat.st_mode) || pathStat.st_size < 1 ||
      static_cast<std::uint64_t>(pathStat.st_size) > maximumBytes) {
    throw std::runtime_error("bounded-regular-file-required");
  }
  const int fd = open(filePath, O_RDONLY | O_CLOEXEC | O_NOFOLLOW);
  if (fd < 0) throw std::runtime_error(ErrorText("open failed"));
  struct stat descriptorStat{};
  if (fstat(fd, &descriptorStat) != 0 || !SameStat(pathStat, descriptorStat)) {
    close(fd);
    throw std::runtime_error("file-changed-before-read");
  }
  *initialStat = descriptorStat;
  return fd;
}

inline NSData* ReadRegularFile(NSString* path, std::size_t maximumBytes) {
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
      throw std::runtime_error(count == 0 ? "file-ended-during-read" : ErrorText("read failed"));
    }
    offset += static_cast<std::size_t>(count);
  }
  struct stat finalStat{};
  const bool unchanged = fstat(fd, &finalStat) == 0 && SameStat(initialStat, finalStat);
  close(fd);
  if (!unchanged) throw std::runtime_error("file-changed-during-read");
  return data;
}

inline NSDictionary* LoadJson(NSString* path, std::size_t maximumBytes) {
  NSError* error = nil;
  id value = [NSJSONSerialization JSONObjectWithData:ReadRegularFile(path, maximumBytes)
                                              options:0 error:&error];
  if (error || ![value isKindOfClass:NSDictionary.class]) throw std::runtime_error("json-invalid");
  return value;
}

inline void ExactKeys(NSDictionary* value, NSArray<NSString*>* keys, const char* label) {
  if (![value isKindOfClass:NSDictionary.class] ||
      ![[NSSet setWithArray:value.allKeys] isEqualToSet:[NSSet setWithArray:keys]]) {
    throw std::runtime_error(std::string(label) + "-invalid");
  }
}

inline NSData* CanonicalJson(id value) {
  NSError* error = nil;
  NSData* encoded = [NSJSONSerialization dataWithJSONObject:value
      options:NSJSONWritingSortedKeys | NSJSONWritingWithoutEscapingSlashes error:&error];
  if (error || !encoded) throw std::runtime_error("canonical-json-invalid");
  return encoded;
}

inline NSString* Sha256Data(NSData* data) {
  unsigned char digest[CC_SHA256_DIGEST_LENGTH];
  CC_SHA256(data.bytes, static_cast<CC_LONG>(data.length), digest);
  NSMutableString* value = [NSMutableString stringWithCapacity:CC_SHA256_DIGEST_LENGTH * 2];
  for (unsigned char byte : digest) [value appendFormat:@"%02x", byte];
  return value;
}

inline NSString* Sha256File(NSString* path, std::size_t maximumBytes) {
  return Sha256Data(ReadRegularFile(path, maximumBytes));
}

inline NSString* ExecutablePath() {
  uint32_t bytes = 0;
  _NSGetExecutablePath(nullptr, &bytes);
  std::vector<char> buffer(bytes + 1, 0);
  if (_NSGetExecutablePath(buffer.data(), &bytes) != 0) throw std::runtime_error("executable-path-invalid");
  char* resolved = realpath(buffer.data(), nullptr);
  if (!resolved) throw std::runtime_error(ErrorText("executable-realpath-failed"));
  NSString* value = [NSString stringWithUTF8String:resolved];
  std::free(resolved);
  return value;
}

inline bool FiniteNumber(id value, double minimum, double maximum) {
  if (![value isKindOfClass:NSNumber.class] ||
      CFGetTypeID((__bridge CFTypeRef)value) == CFBooleanGetTypeID()) return false;
  const double number = [value doubleValue];
  return std::isfinite(number) && number >= minimum && number <= maximum;
}

inline bool IntegerNumber(id value, long long minimum, long long maximum) {
  return FiniteNumber(value, static_cast<double>(minimum), static_cast<double>(maximum)) &&
      std::floor([value doubleValue]) == [value doubleValue];
}

inline bool Identifier(NSString* value) {
  if (![value isKindOfClass:NSString.class] || value.length < 1 || value.length > 160) return false;
  NSCharacterSet* allowed = [NSCharacterSet characterSetWithCharactersInString:
      @"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-"];
  return [value rangeOfCharacterFromSet:allowed.invertedSet].location == NSNotFound &&
      [[NSCharacterSet alphanumericCharacterSet] characterIsMember:[value characterAtIndex:0]];
}

inline bool Sha256String(NSString* value) {
  if (![value isKindOfClass:NSString.class] || value.length != 64) return false;
  NSCharacterSet* allowed = [NSCharacterSet characterSetWithCharactersInString:@"0123456789abcdef"];
  return [value rangeOfCharacterFromSet:allowed.invertedSet].location == NSNotFound;
}

inline NSString* ProviderFingerprint(NSDictionary* manifest, NSArray<NSString*>* capabilities) {
  NSDictionary* runtime = manifest[@"runtime"];
  NSArray* keys = @[@"providerSha256", @"maxFrames", @"maxDurationMs", @"maxWallTimeMs",
      @"maxMemoryMb", @"maxOutputBytes", @"maxConcurrentJobs", @"device", @"runtimeMode",
      @"cpuThreads", @"sampleFps", @"modelResident"];
  NSMutableDictionary* normalized = [NSMutableDictionary dictionary];
  for (NSString* key in keys) {
    if (!runtime[key]) throw std::runtime_error("manifest-runtime-invalid");
    normalized[key] = runtime[key];
  }
  NSDictionary* payload = @{
    @"schemaVersion": manifest[@"schemaVersion"], @"protocol": manifest[@"protocol"],
    @"providerId": manifest[@"providerId"], @"providerVersion": manifest[@"providerVersion"],
    @"displayName": manifest[@"displayName"], @"stage": manifest[@"stage"],
    @"priority": manifest[@"priority"], @"capabilities": capabilities,
    @"upstream": manifest[@"upstream"], @"models": manifest[@"models"], @"runtime": normalized,
  };
  return Sha256Data(CanonicalJson(payload));
}

inline void WriteAtomic(NSString* outputPath, NSData* data) {
  NSString* temporary = [[outputPath stringByDeletingPathExtension] stringByAppendingPathExtension:@"tmp"];
  const int fd = open(temporary.fileSystemRepresentation,
                      O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW, 0600);
  if (fd < 0) throw std::runtime_error(ErrorText("output-open-failed"));
  try {
    std::size_t offset = 0;
    while (offset < data.length) {
      const ssize_t count = write(fd, static_cast<const std::uint8_t*>(data.bytes) + offset,
                                  data.length - offset);
      if (count < 0 && errno == EINTR) continue;
      if (count <= 0) throw std::runtime_error(ErrorText("output-write-failed"));
      offset += static_cast<std::size_t>(count);
    }
    if (fsync(fd) != 0 || close(fd) != 0) throw std::runtime_error(ErrorText("output-sync-failed"));
  } catch (...) {
    close(fd);
    unlink(temporary.fileSystemRepresentation);
    throw;
  }
  if (renamex_np(temporary.fileSystemRepresentation, outputPath.fileSystemRepresentation,
                 RENAME_EXCL) != 0) {
    unlink(temporary.fileSystemRepresentation);
    throw std::runtime_error(ErrorText("output-rename-failed"));
  }
}

}  // namespace fs_tracking_native
