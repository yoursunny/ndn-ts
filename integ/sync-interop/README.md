# `@ndn/psync` and `@ndn/svs` Interoperability Test

## PSync

Test environment:

* Ubuntu 22.04
* ndn-cxx 0.9.0-16-gd384a530
* NFD 24.07-11-ga745025b
* Node.js v22.13.0

Reference implementation:

* PSync 0.5.0-1-gf4571e8d

Build reference program:

```bash
# in PSync directory, build library and examples
./waf configure --with-examples
./waf

# in PSync directory, build examples only
mkdir -p build/examples
for F in examples/*.cpp; do
  g++ --std=c++17 -o build/examples/psync-$(basename -s .cpp $F) $F $(pkg-config --cflags --libs libndn-cxx PSync)
done
```

Test `FullSync`:

```bash
# in NDNts directory
corepack pnpm literate integ/sync-interop/psync-full.ts

# in PSync directory
export NDN_LOG=examples.FullSyncApp=INFO
LD_LIBRARY_PATH=build ./build/examples/psync-full-sync /psync-interop /psync-memphis/${RANDOM} 10 1000
```

Test `PartialPublisher`:

```bash
# in NDNts directory
corepack pnpm literate integ/sync-interop/psync-partial-publisher.ts

# in PSync directory
export NDN_LOG=examples.PartialSyncConsumerApp=INFO
LD_LIBRARY_PATH=build ./build/examples/psync-consumer /psync-interop 5
```

Test `PartialSubscriber`:

```bash
# in PSync directory
export NDN_LOG=examples.PartialSyncProducerApp=INFO
LD_LIBRARY_PATH=build ./build/examples/psync-producer /psync-interop /psync-memphis/${RANDOM} 10 1000

# in NDNts directory
corepack pnpm literate integ/sync-interop/psync-partial-subscriber.ts
```

## syncps

Test environment:

* Ubuntu 22.04
* ndn-cxx 0.8.1-51-g16203ea2
* NFD 22.12-37-g4c95771b
* Node.js 20.10.0
* Docker 24.0.7

Reference implementation:

* [ndn-ind](https://github.com/operantnetworks/ndn-ind) commit `8bc5d60b40afa2f03e11ecb591a852dff8a66422` (2021-09-19)
* syncps in [DNMP-v2](https://github.com/pollere/DNMP-v2) commit `d42092e40a88b676c2181615d13b3b0bbaea5699` (2021-01-15)

Build reference program as Docker container:

```bash
# in NDNts directory
cd integ/sync-interop
docker build -t localhost/ndnts-sync-interop-syncps -f Dockerfile.syncps .
```

Test `SyncpsPubsub`:

```bash
# with NFD running
docker run -it --rm \
  --mount type=bind,src=/run/nfd/nfd.sock,target=/var/run/nfd.sock \
  localhost/ndnts-sync-interop-syncps \
  /sync-interop/syncps-ind.exe /syncps-interop /syncps-interop-data /syncps-interop-data/ind/$RANDOM

# in NDNts directory
corepack pnpm literate integ/sync-interop/syncps.ts
```

## StateVectorSync

Test environment:

* Ubuntu 22.04
* ndn-cxx 0.9.0-16-gd384a530
* NFD 24.07-11-ga745025b
* Node.js v22.13.0
* Go 1.23.4

Reference implementation:

* [StateVectorSync C++ library](https://github.com/named-data/ndn-svs) commit `7fa0af007772c2e320bdc3996fd3bb57fbb21347` (2025-01-05)
* [NDNd](https://github.com/named-data/ndnd) commit `814d19d06446eeb84cecbe24ee4469ea7fca3a4c` (2025-01-14)

Build reference program:

```bash
# in ndn-svs directory
./waf configure --with-examples
./waf

# in $HOME directory
go install -v github.com/named-data/ndnd/std/examples/low-level/svs@v1.4.3-0.20250113180516-814d19d06446
```

The sync group prefix shall use multicast strategy:

```bash
# start NFD
sudo systemctl restart nfd

# set multicast strategy
nfdc strategy set /ndn/svs /localhost/nfd/strategy/multicast
```

Test `SvSync` (SVS v2):

```bash
# C++: in ndn-svs directory
LD_LIBRARY_PATH=build ./build/examples/core /cpp-${RANDOM}

# in NDNts directory
corepack pnpm literate integ/sync-interop/svsync.ts /NDNts-${RANDOM}
```

Test `SvSync` (SVS v3):

```bash
# NDNd: in $HOME directory
~/go/bin/svs /ndnd-svs3

# in NDNts directory
corepack pnpm literate integ/sync-interop/svsync.ts --svs3 /NDNts-svs3
```

Test `SvPublisher`:

```bash
# in NDNts directory
corepack pnpm literate integ/sync-interop/svsps-publisher.ts /NDNts-${RANDOM}

# C++: in ndn-svs directory
LD_LIBRARY_PATH=build ./build/examples/chat-pubsub /cpp-${RANDOM}
```

Test `SvSubscriber`:

```bash
# C++: in ndn-svs directory
LD_LIBRARY_PATH=build ./build/examples/chat-pubsub /cpp-${RANDOM}

# in NDNts directory
corepack pnpm literate integ/sync-interop/svsps-subscriber.ts
```

What to do and what to observe:

* For C++ `chat-pubsub` publisher: type a line on the console and press ENTER to publish an update.
* NDNts and NDNd publisher do not need user interaction.
* Look at console logs: when one peer publishes an update, the other peer should see the update.
