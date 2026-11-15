#include <chrono>
#include <cstdint>
#include <ctime>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>
#include <sys/syscall.h>
#include <unistd.h>

using Clock = std::chrono::steady_clock;
struct Record {
    std::int64_t timestamp_ns, thread_cpu_ns;
    unsigned seq;
    long tid;
    const char* event;
};
static std::vector<Record> records;
static bool busy_mode;
static long worker_tid;

static std::int64_t steady_ns() {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(
        Clock::now().time_since_epoch()).count();
}

static std::int64_t thread_cpu_ns() {
    timespec value{};
    if (clock_gettime(CLOCK_THREAD_CPUTIME_ID, &value) != 0)
        throw std::runtime_error("cannot read thread CPU clock");
    return static_cast<std::int64_t>(value.tv_sec) * 1000000000 + value.tv_nsec;
}

static void mark(unsigned seq, const char* event) {
    const auto timestamp = steady_ns();
    const auto cpu = thread_cpu_ns();
    records.push_back(Record{timestamp, cpu, seq, worker_tid, event});
}

// Stable unmangled names simplify this experiment's probe discovery.
// The workload is single-threaded, synchronous, and non-recursive.
extern "C" __attribute__((noinline)) void perform_work(unsigned seq) {
    mark(seq, "WORK_ENTER");
    if (busy_mode) {
        const auto end = Clock::now() + std::chrono::milliseconds(20);
        while (Clock::now() < end) { }
    } else {
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
    mark(seq, "WORK_EXIT");
}

extern "C" __attribute__((noinline)) void run_cycle(unsigned seq) {
    mark(seq, "CYCLE_ENTER");
    mark(seq, "BEFORE_CALL");
    perform_work(seq);
    mark(seq, "AFTER_CALL");
}

static unsigned positive_argument(const char* argument) {
    const std::string value(argument);
    if (value.empty() || value.find_first_not_of("0123456789") != std::string::npos)
        throw std::runtime_error("count and period must contain decimal digits only");
    std::size_t used = 0;
    const auto number = std::stoul(value, &used);
    if (used != value.size() || number < 1 || number > 10000)
        throw std::runtime_error("count and period must be in 1..10000");
    return static_cast<unsigned>(number);
}

int main(int argc, char** argv) {
    try {
        if (argc > 5)
            throw std::runtime_error("usage: timing_lab [sleep|busy] [count] [period_ms] [output.csv]");
        const std::string mode = argc > 1 ? argv[1] : "sleep";
        if (mode != "sleep" && mode != "busy")
            throw std::runtime_error("mode must be sleep or busy");
        busy_mode = mode == "busy";
        const unsigned count = argc > 2 ? positive_argument(argv[2]) : 40;
        const unsigned period = argc > 3 ? positive_argument(argv[3]) : 100;
        const char* output = argc > 4 ? argv[4] : "trace.csv";
        worker_tid = syscall(SYS_gettid);
        if (worker_tid < 1) throw std::runtime_error("cannot read TID");
        records.reserve(static_cast<std::size_t>(count) * 5);
        std::cerr << "pid=" << getpid() << " tid=" << worker_tid << " mode=" << mode << '\n';
        auto deadline = Clock::now();
        for (unsigned seq = 1; seq <= count; ++seq) {
            run_cycle(seq);
            deadline += std::chrono::milliseconds(period);
            std::this_thread::sleep_until(deadline);
        }
        std::ofstream stream(output);
        if (!stream) throw std::runtime_error("cannot open output file");
        stream << "timestamp_ns,thread_cpu_ns,seq,tid,event\n";
        for (const auto& record : records)
            stream << record.timestamp_ns << ',' << record.thread_cpu_ns << ','
                   << record.seq << ',' << record.tid << ',' << record.event << '\n';
        stream.close();
        if (!stream) throw std::runtime_error("output write failed");
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
