#import <Foundation/Foundation.h>

#include <exception>
#include <iostream>

#include "yolox-native-coreml-provider.hpp"

int main(int argc, char** argv) {
  @autoreleasepool {
    try {
      FSProviderInvocation invocation = FSLoadProviderInvocation(argc, argv);
      NSArray<NSDictionary*>* observations = FSRunYoloxDetection(invocation);
      FSWriteProviderResult(invocation, observations);
      return 0;
    } catch (const std::exception& error) {
      std::cerr << "tracking-provider-failed: " << error.what() << "\n";
      return 1;
    }
  }
}
