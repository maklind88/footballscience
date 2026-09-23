#pragma once

#import <Foundation/Foundation.h>

#include <cstddef>
#include <string>

struct FSByteTrackInvocation {
  NSDictionary* manifest;
  NSDictionary* request;
  NSArray<NSString*>* capabilities;
  NSString* outputPath;
  NSString* providerFingerprint;
  NSString* requestFingerprint;
  std::size_t maximumOutputBytes;
  double sampleFps;
};

[[noreturn]] void FSByteTrackFail(const std::string& message);
FSByteTrackInvocation FSLoadByteTrackInvocation(int argc, char** argv);
NSArray<NSDictionary*>* FSRunByteTrackAssociation(const FSByteTrackInvocation& invocation);
void FSWriteByteTrackResult(
    const FSByteTrackInvocation& invocation,
    NSArray<NSDictionary*>* trajectories);
