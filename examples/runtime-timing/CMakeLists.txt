cmake_minimum_required(VERSION 3.16)
project(runtime_timing LANGUAGES CXX)
if(NOT CMAKE_SYSTEM_NAME STREQUAL "Linux")
    message(FATAL_ERROR "This experiment requires Linux thread IDs and CPU clocks")
endif()
find_package(Threads REQUIRED)
add_executable(timing_lab timing_lab.cpp)
set_target_properties(timing_lab PROPERTIES
    CXX_STANDARD 11 CXX_STANDARD_REQUIRED YES CXX_EXTENSIONS NO)
target_compile_options(timing_lab PRIVATE
    -g3 -O0 -fno-omit-frame-pointer -Wall -Wextra -Wpedantic)
target_link_libraries(timing_lab PRIVATE Threads::Threads)
