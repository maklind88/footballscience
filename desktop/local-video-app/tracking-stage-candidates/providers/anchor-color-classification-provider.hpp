#pragma once

#import <Foundation/Foundation.h>

#include <cstddef>
#include <string>

struct FSAnchorColorInvocation {
  NSDictionary* manifest;
  NSDictionary* request;
  NSDictionary* specification;
  NSArray<NSString*>* capabilities;
  NSString* sourcePath;
  NSString* outputPath;
  NSString* providerFingerprint;
  NSString* requestFingerprint;
  std::size_t maximumOutputBytes;
  double sampleFps;
  long long maximumFrames;
  int decoderThreads;
};

[[noreturn]] void FSAnchorColorFail(const std::string& message);
FSAnchorColorInvocation FSLoadAnchorColorInvocation(int argc, char** argv);
NSArray<NSDictionary*>* FSRunAnchorColorClassification(const FSAnchorColorInvocation& invocation);
void FSWriteAnchorColorResult(
    const FSAnchorColorInvocation& invocation,
    NSArray<NSDictionary*>* classifications);
