#pragma once

#import <Foundation/Foundation.h>

#include <cstddef>
#include <string>

struct FSProviderInvocation {
  __strong NSDictionary* manifest = nil;
  __strong NSDictionary* request = nil;
  __strong NSArray<NSString*>* capabilities = nil;
  __strong NSString* sourcePath = nil;
  __strong NSString* modelPath = nil;
  __strong NSString* outputPath = nil;
  __strong NSString* providerFingerprint = nil;
  std::size_t maximumOutputBytes = 0;
};

[[noreturn]] void FSProviderFail(const std::string& message);
FSProviderInvocation FSLoadProviderInvocation(int argc, char** argv);
NSArray<NSDictionary*>* FSRunYoloxDetection(const FSProviderInvocation& invocation);
void FSWriteProviderResult(
    const FSProviderInvocation& invocation,
    NSArray<NSDictionary*>* observations);
