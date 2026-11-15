#include <algorithm>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <exception>
#include <fstream>
#include <iostream>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>
#include <utility>
#include <vector>
#include <sys/syscall.h>
#include <unistd.h>

using Clock = std::chrono::steady_clock;
struct Record { std::int64_t ns; unsigned seq; long tid; const char* event; };

class TraceBuffer {
    long tid_;
public:
    std::vector<Record> records;
    explicit TraceBuffer(unsigned count) : tid_(syscall(SYS_gettid)) {
        if (tid_ < 1) throw std::runtime_error("cannot read thread identity");
        records.reserve(static_cast<std::size_t>(count) * 6);
    }
    void mark(unsigned seq, const char* event) {
        const auto ns = std::chrono::duration_cast<std::chrono::nanoseconds>(
            Clock::now().time_since_epoch()).count();
        records.push_back(Record{ns, seq, tid_, event});
    }
};

class Worker {
    TraceBuffer& trace_;
public:
    unsigned completed = 0;
    explicit Worker(TraceBuffer& trace) : trace_(trace) {}
    __attribute__((noinline)) void process(unsigned seq) {
        trace_.mark(seq, "WORK_ENTER");
        ++completed;
        trace_.mark(seq, "WORK_EXIT");
    }
};

class Dispatcher {
    TraceBuffer& trace_;
    Worker& worker_;
    bool delay_;
public:
    Dispatcher(TraceBuffer& trace, Worker& worker, bool delay)
        : trace_(trace), worker_(worker), delay_(delay) {}
    __attribute__((noinline)) void dispatch(unsigned seq) {
        trace_.mark(seq, "DISPATCH_ENTER");
        trace_.mark(seq, "BEFORE_CALL");
        if (delay_ && seq == 3) std::this_thread::sleep_for(std::chrono::milliseconds(30));
        worker_.process(seq);
        trace_.mark(seq, "AFTER_CALL");
    }
};

static unsigned parse_count(const std::string& value) {
    if (value.empty() || value.find_first_not_of("0123456789") != std::string::npos)
        throw std::runtime_error("count must contain decimal digits");
    const auto count = std::stoul(value);
    if (count < 3 || count > 1000) throw std::runtime_error("count must be in 3..1000");
    return static_cast<unsigned>(count);
}

int main(int argc, char** argv) {
    try {
        if (argc != 6) throw std::runtime_error(
            "usage: event_pipeline direct|queued baseline|source-gap|dispatch-wait COUNT RUN_ID OUTPUT.csv");
        const std::string mode(argv[1]), scenario(argv[2]), run_id(argv[4]);
        if (mode != "direct" && mode != "queued") throw std::runtime_error("invalid mode");
        if (scenario != "baseline" && scenario != "source-gap" && scenario != "dispatch-wait")
            throw std::runtime_error("invalid scenario");
        const unsigned count = parse_count(argv[3]);
        if (run_id.empty() || run_id.size() > 64 ||
            run_id.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_") != std::string::npos)
            throw std::runtime_error("run ID must contain 1..64 letters, digits, hyphens or underscores");
        TraceBuffer source(count);
        std::vector<Record> consumer_records;
        // One producer, one FIFO consumer; all queue storage is allocated upfront.
        std::vector<unsigned> queue(count);
        unsigned available = 0;
        bool done = false;
        std::mutex mutex;
        std::condition_variable ready;
        std::exception_ptr consumer_error;
        std::thread consumer;
        if (mode == "queued") {
            consumer = std::thread([&] {
                try {
                    TraceBuffer trace(count);
                    Worker worker(trace);
                    Dispatcher dispatcher(trace, worker, scenario == "dispatch-wait");
                    unsigned read = 0;
                    for (;;) {
                        std::unique_lock<std::mutex> lock(mutex);
                        ready.wait(lock, [&] { return read < available || done; });
                        if (read == available && done) break;
                        const unsigned seq = queue[read++];
                        lock.unlock();
                        dispatcher.dispatch(seq);
                    }
                    consumer_records = std::move(trace.records);
                } catch (...) { consumer_error = std::current_exception(); }
            });
        }
        Worker worker(source);
        Dispatcher dispatcher(source, worker, scenario == "dispatch-wait");
        for (unsigned seq = 1; seq <= count; ++seq) {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
            if (scenario == "source-gap" && seq == 3)
                std::this_thread::sleep_for(std::chrono::milliseconds(30));
            source.mark(seq, "RECEIVED");
            if (mode == "direct") dispatcher.dispatch(seq);
            else {
                {
                    std::lock_guard<std::mutex> lock(mutex);
                    queue[available++] = seq;
                }
                ready.notify_one();
            }
        }
        if (consumer.joinable()) {
            {
                std::lock_guard<std::mutex> lock(mutex);
                done = true;
            }
            ready.notify_one();
            consumer.join();
            if (consumer_error) std::rethrow_exception(consumer_error);
        }
        source.records.insert(source.records.end(), consumer_records.begin(), consumer_records.end());
        std::stable_sort(source.records.begin(), source.records.end(),
                         [](const Record& a, const Record& b) { return a.ns < b.ns; });
        std::ofstream output(argv[5]);
        if (!output) throw std::runtime_error("cannot open output file");
        output << "run_id,timestamp_ns,seq,tid,event\n";
        for (const auto& r : source.records)
            output << run_id << ',' << r.ns << ',' << r.seq << ',' << r.tid << ',' << r.event << '\n';
        output.close();
        if (!output) throw std::runtime_error("output write failed");
        std::cerr << "pid=" << getpid() << " mode=" << mode << " scenario=" << scenario
                  << " run_id=" << run_id << " invocations=" << count << '\n';
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return 1;
    }
}
