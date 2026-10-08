# Changelog

## [0.10.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.9.0...auto-mode-v0.10.0) (2026-10-08)


### Features

* **geo-154:** deny writes outside the task scope ([#54](https://github.com/zgeoff/auto-mode/issues/54)) ([2b61948](https://github.com/zgeoff/auto-mode/commit/2b619485344cfab714b8f7ecf02c3740b377f942))

## [0.9.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.8.0...auto-mode-v0.9.0) (2026-10-08)


### Features

* **geo-176:** read only the registry config shape ([#52](https://github.com/zgeoff/auto-mode/issues/52)) ([fae9e0d](https://github.com/zgeoff/auto-mode/commit/fae9e0d782a091a8e29d9460796a4d1d4b801d6c))

## [0.8.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.7.0...auto-mode-v0.8.0) (2026-10-08)


### Features

* **geo-155:** reach a human only through a denial budget ([#50](https://github.com/zgeoff/auto-mode/issues/50)) ([974100a](https://github.com/zgeoff/auto-mode/commit/974100ab602bd0004463627baf90e7b72ec0e785))

## [0.7.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.6.0...auto-mode-v0.7.0) (2026-10-08)


### Features

* **geo-174:** reshape the config around classifier and scope registries ([#48](https://github.com/zgeoff/auto-mode/issues/48)) ([dafd8f7](https://github.com/zgeoff/auto-mode/commit/dafd8f73f631c748ac6f4731052d4174ba2678c0))

## [0.6.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.5.0...auto-mode-v0.6.0) (2026-10-07)


### Features

* **geo-152:** deny with a reason instead of asking ([#44](https://github.com/zgeoff/auto-mode/issues/44)) ([755b80d](https://github.com/zgeoff/auto-mode/commit/755b80d02bc7b82ea0aa459f9b988b431c6c2793))

## [0.5.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.4.4...auto-mode-v0.5.0) (2026-10-07)


### Features

* **geo-153:** split auto-mode into a core library and a mod ([#41](https://github.com/zgeoff/auto-mode/issues/41)) ([6a44fa4](https://github.com/zgeoff/auto-mode/commit/6a44fa44dadf9ab2880a991aab3f00d3bc408f4f))

## [0.4.4](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.4.3...auto-mode-v0.4.4) (2026-10-07)


### Bug Fixes

* **geo-92:** accept probability sums at the ±0.01 boundary ([#36](https://github.com/zgeoff/auto-mode/issues/36)) ([1ff374c](https://github.com/zgeoff/auto-mode/commit/1ff374c96e4537685b60b61b22511b4933353f70))

## [0.4.3](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.4.2...auto-mode-v0.4.3) (2026-10-06)


### Bug Fixes

* record request size and aborts in decision diagnostics ([#26](https://github.com/zgeoff/auto-mode/issues/26)) ([0fcf1a9](https://github.com/zgeoff/auto-mode/commit/0fcf1a924e4613698eb97fef6c5b7fb6e4055687))
* send shared answer guidance once and record failure reasons ([#24](https://github.com/zgeoff/auto-mode/issues/24)) ([89069de](https://github.com/zgeoff/auto-mode/commit/89069de470d4c5d2e54cd2fdc8e28a5a1f4cca4c))

## [0.4.2](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.4.1...auto-mode-v0.4.2) (2026-10-04)


### Bug Fixes

* clarify source-edit and synthetic-fixture applicability ([#21](https://github.com/zgeoff/auto-mode/issues/21)) ([661a25d](https://github.com/zgeoff/auto-mode/commit/661a25d15cb2e4f265449bea2f07d364b5ef978c))

## [0.4.1](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.4.0...auto-mode-v0.4.1) (2026-10-04)


### Bug Fixes

* record permission diagnostics and check branch evidence ([#19](https://github.com/zgeoff/auto-mode/issues/19)) ([9e4e7d3](https://github.com/zgeoff/auto-mode/commit/9e4e7d351535acb3f78e8ed15757c37566f6213e))

## [0.4.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.3.0...auto-mode-v0.4.0) (2026-10-04)


### Features

* add claude tool.check approval mod ([8545610](https://github.com/zgeoff/auto-mode/commit/8545610b787c77bbfe7ac88a9faa2e422f6fca3a))
* add jev approvals with configured permission rules ([#16](https://github.com/zgeoff/auto-mode/issues/16)) ([d83e968](https://github.com/zgeoff/auto-mode/commit/d83e968120e67809d977e5ebb04d55fc4e65b704))

## [0.3.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.2.0...auto-mode-v0.3.0) (2026-09-18)


### Features

* answer a permission request with a nested decision ([#10](https://github.com/zgeoff/auto-mode/issues/10)) ([c61b991](https://github.com/zgeoff/auto-mode/commit/c61b991972256ce41a74ef9afdb1e1b63b7ddc0f))

## [0.2.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.1.0...auto-mode-v0.2.0) (2026-09-18)


### Features

* add the local rule tier and wire it into a run command ([39deff5](https://github.com/zgeoff/auto-mode/commit/39deff5f7777ed800a2417fc5502098793ee89c0))
* add the model tier, configuration, and hook installation ([3241040](https://github.com/zgeoff/auto-mode/commit/324104062d1f68ae96e33413fe83d9ab70f6889b))
* add the policy loader, CLI and build pipeline ([3275210](https://github.com/zgeoff/auto-mode/commit/3275210dcf30fefbbcad5cc1c43e3000b2356d86))
* detect the harness and render the verdict all three accept ([88c0c6d](https://github.com/zgeoff/auto-mode/commit/88c0c6d1e70bbc4542bae9db1707e60a1ac5606e))


### Bug Fixes

* correct the hook entry shape for each harness ([4ef8607](https://github.com/zgeoff/auto-mode/commit/4ef8607ed76e657b8a32f8308b9d0a88df9e25c2))
* keep the formatter off the generated changelog ([#9](https://github.com/zgeoff/auto-mode/issues/9)) ([254435b](https://github.com/zgeoff/auto-mode/commit/254435beba4e859e68443a816e6fc8a6baf08567))
