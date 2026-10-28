# Changelog

## [3.1.2](https://github.com/zgeoff/auto-mode/compare/auto-mode-v3.1.1...auto-mode-v3.1.2) (2026-10-28)


### Bug Fixes

* **release:** merge the release pull request on its component branch ([#336](https://github.com/zgeoff/auto-mode/issues/336)) ([ccaf610](https://github.com/zgeoff/auto-mode/commit/ccaf6106a03a22adc82965ed3ccc322059a5eeca))
* **release:** publish each tagged release from a run at its tag ([#334](https://github.com/zgeoff/auto-mode/issues/334)) ([82e531b](https://github.com/zgeoff/auto-mode/commit/82e531bba45555cf04b72af464253266efea80c1))

## [3.1.1](https://github.com/zgeoff/auto-mode/compare/auto-mode-v3.1.0...auto-mode-v3.1.1) (2026-10-28)


### Bug Fixes

* run the skill-gate hook with bun --no-install ([#331](https://github.com/zgeoff/auto-mode/issues/331)) ([1b13da1](https://github.com/zgeoff/auto-mode/commit/1b13da145913e095c8eb528c0201b1f726faebf1))

## [3.1.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v3.0.1...auto-mode-v3.1.0) (2026-10-28)


### Features

* **scope:** read a session's scope from a launcher scope file ([#327](https://github.com/zgeoff/auto-mode/issues/327)) ([54b2a96](https://github.com/zgeoff/auto-mode/commit/54b2a96a7403a65b7cd01435254c248e8409fa48))


### Bug Fixes

* **deps:** update qs to fix advisories ([#325](https://github.com/zgeoff/auto-mode/issues/325)) ([ab32ca0](https://github.com/zgeoff/auto-mode/commit/ab32ca05b761fd74bc45c97415ee2725f82fd4ce))
* **judge:** clear a misread hard deny past weakly blocking soft rules ([#328](https://github.com/zgeoff/auto-mode/issues/328)) ([e010ce3](https://github.com/zgeoff/auto-mode/commit/e010ce308dfe300a647ec2f31a255bb4606f758d))

## [3.0.1](https://github.com/zgeoff/auto-mode/compare/auto-mode-v3.0.0...auto-mode-v3.0.1) (2026-10-22)


### Bug Fixes

* **jev:** close two gaps the hook-bypass guard left ([#301](https://github.com/zgeoff/auto-mode/issues/301)) ([87fbd52](https://github.com/zgeoff/auto-mode/commit/87fbd528dc9f43bfea6788aaf98548cf9123879a))
* **jev:** flag a git subcommand or options that a shell expansion hides ([#302](https://github.com/zgeoff/auto-mode/issues/302)) ([07a795a](https://github.com/zgeoff/auto-mode/commit/07a795ab8316ea526eee0e4b1cbb19be976d6d65))
* **jev:** flag a swapped lefthook binary or git config as tampering ([#299](https://github.com/zgeoff/auto-mode/issues/299)) ([ea0bcc4](https://github.com/zgeoff/auto-mode/commit/ea0bcc48a3255e6de0148d5b5e51d82ab5f21c44))
* **jev:** send a lefthook step exclusion to policy tampering ([#297](https://github.com/zgeoff/auto-mode/issues/297)) ([9395200](https://github.com/zgeoff/auto-mode/commit/9395200b97d563e3742b1d3fa6d88d82603a5705))
* **jev:** send a replaced hooks config or folder to policy tampering ([#298](https://github.com/zgeoff/auto-mode/issues/298)) ([f436647](https://github.com/zgeoff/auto-mode/commit/f436647938af32f31b4fa998eaee6e6af76eb8de))
* **judge:** let a misread clear a hard deny the classifier allowed ([#295](https://github.com/zgeoff/auto-mode/issues/295)) ([3ee5c91](https://github.com/zgeoff/auto-mode/commit/3ee5c916d871a703b1fe6ebb016ad17081a699b4))

## [3.0.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v2.0.2...auto-mode-v3.0.0) (2026-10-20)


### ⚠ BREAKING CHANGES

* **geo-1385:** the capture folder key is now `capture.directory`. A config that sets `capture.dir` no longer loads: rename the key to `capture.directory` in your auto-mode config file.

### Features

* **geo-1385:** rename capture.dir to capture.directory ([#272](https://github.com/zgeoff/auto-mode/issues/272)) ([69c731f](https://github.com/zgeoff/auto-mode/commit/69c731f705871b5a966bc9a3ddd6ca9aa966e2ba))

## [2.0.2](https://github.com/zgeoff/auto-mode/compare/auto-mode-v2.0.1...auto-mode-v2.0.2) (2026-10-19)


### Bug Fixes

* **geo-1287:** anonymise the question-severity corpus and its samples ([#241](https://github.com/zgeoff/auto-mode/issues/241)) ([30ac50c](https://github.com/zgeoff/auto-mode/commit/30ac50c5128c82e1a0a0d0217f916abe4e64dbd5))
* **geo-1321:** invent the message text in the public corpora ([#243](https://github.com/zgeoff/auto-mode/issues/243)) ([d71b8d1](https://github.com/zgeoff/auto-mode/commit/d71b8d1509d2ede6b19875819022475f78d9412b))

## [2.0.1](https://github.com/zgeoff/auto-mode/compare/auto-mode-v2.0.0...auto-mode-v2.0.1) (2026-10-17)


### Bug Fixes

* **containment:** flag auto-mode record only when auto-mode runs ([#205](https://github.com/zgeoff/auto-mode/issues/205)) ([4dd7ff0](https://github.com/zgeoff/auto-mode/commit/4dd7ff02e811288ed1ec5d9c80a3275f72de72af))

## [2.0.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v1.0.1...auto-mode-v2.0.0) (2026-10-16)


### ⚠ BREAKING CHANGES

* **geo-1063:** decision.classifier no longer accepts the spark, claude, glm or messages kinds, and policy/classifier.md is gone.

### Features

* **geo-1063:** review every deny of a prompted call in one judge call ([#196](https://github.com/zgeoff/auto-mode/issues/196)) ([843df5c](https://github.com/zgeoff/auto-mode/commit/843df5c32698c3e54295f3a64f907004759e812c))
* **geo-1063:** run the judge through a warm agent sdk session ([#193](https://github.com/zgeoff/auto-mode/issues/193)) ([4d08bd2](https://github.com/zgeoff/auto-mode/commit/4d08bd2612725532c6d4e51f1c2625a6a11901f2))


### Code Refactoring

* **geo-1063:** remove the generative classifier path ([#191](https://github.com/zgeoff/auto-mode/issues/191)) ([f9d7ab4](https://github.com/zgeoff/auto-mode/commit/f9d7ab497c7f2daec1b420ff4c385d5ddb34eeea))

## [1.0.1](https://github.com/zgeoff/auto-mode/compare/auto-mode-v1.0.0...auto-mode-v1.0.1) (2026-10-16)


### Bug Fixes

* **geo-1145:** keep command text out of jev instructions and keep each merge finding ([#192](https://github.com/zgeoff/auto-mode/issues/192)) ([77ad65b](https://github.com/zgeoff/auto-mode/commit/77ad65b48450f4d243baa28806bf642e4b7b3c32))

## [1.0.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.21.0...auto-mode-v1.0.0) (2026-10-16)


### ⚠ BREAKING CHANGES

* **geo-1065:** the package root no longer exports DEFAULT_CONFIG, PRESETS, resolveConfigPath, resolveApiKey, loadClaudeRules, checkContainment, buildDecisionRequest, classifyWithModel, DecisionRequestError, parseModelVerdict, sendDecision, loadPolicy, recordScope, parseScopeRecordRequest, renderVerdict, classifyLocally, buildTaskScope or tryClassifyEdit, and the auto-mode/policy/classifier.md and auto-mode/policy/rules.md subpaths are gone.

### Features

* **geo-1064:** read the file codex exec writes its last message to ([#182](https://github.com/zgeoff/auto-mode/issues/182)) ([64e648d](https://github.com/zgeoff/auto-mode/commit/64e648da47d95f42bbb086ebeafe8e96a2ec0b28))
* **geo-1065:** publish one entry point, the secret rules and mod-path ([#178](https://github.com/zgeoff/auto-mode/issues/178)) ([92ff11f](https://github.com/zgeoff/auto-mode/commit/92ff11f9107a352cd18cb42d961585df94d4bc7d))
* **geo-1113:** record the model that wrote each judge reply ([#190](https://github.com/zgeoff/auto-mode/issues/190)) ([f08499e](https://github.com/zgeoff/auto-mode/commit/f08499e021cfa13822a31144ab4322a345a6fed7))
* **geo-967:** add a held-out-only catastrophic-allows experiment ([#172](https://github.com/zgeoff/auto-mode/issues/172)) ([800ca66](https://github.com/zgeoff/auto-mode/commit/800ca66b10fe4e5a500e341a5c34ba2d3e1ba82b))
* **geo-972:** count benign denials through the judge in judge-alone ([#187](https://github.com/zgeoff/auto-mode/issues/187)) ([c828df7](https://github.com/zgeoff/auto-mode/commit/c828df737fefd9b979b799405595edb7c3e9a3b8))
* **geo-972:** deny writes to configured protected branches ([#185](https://github.com/zgeoff/auto-mode/issues/185)) ([c696562](https://github.com/zgeoff/auto-mode/commit/c696562d2c29a0c974d2b45676a7df120913f13f))


### Bug Fixes

* **geo-1029:** read an abbreviated commit option's value as git does ([#177](https://github.com/zgeoff/auto-mode/issues/177)) ([3d58d02](https://github.com/zgeoff/auto-mode/commit/3d58d02a240231cda53828096c3b08471a3d1773))
* **geo-1047:** stop the mod's cli run at the cli's own limits ([#186](https://github.com/zgeoff/auto-mode/issues/186)) ([af1eafe](https://github.com/zgeoff/auto-mode/commit/af1eafe027162dc11c670b617c89d8a814b1ca59))
* **geo-1077:** stop denying heredocs that run no outside write ([#174](https://github.com/zgeoff/auto-mode/issues/174)) ([18c6260](https://github.com/zgeoff/auto-mode/commit/18c62603b424187b766094314b1d6c97707975b6))
* **geo-1085:** read each nested $(( substitution once ([#175](https://github.com/zgeoff/auto-mode/issues/175)) ([e78ce7a](https://github.com/zgeoff/auto-mode/commit/e78ce7a92e34345b083ed2bbdb4396dd44a82d45))
* **geo-1093:** count only the requests a live replay run sends ([#176](https://github.com/zgeoff/auto-mode/issues/176)) ([bd73dd1](https://github.com/zgeoff/auto-mode/commit/bd73dd10c8d69bda861afe5059fe73510daa7389))
* **geo-1112:** read a confirm whose reason the judge left unclosed ([#188](https://github.com/zgeoff/auto-mode/issues/188)) ([e979ac9](https://github.com/zgeoff/auto-mode/commit/e979ac943ec6aed35c4cfe71f6a79de78b911644))
* **geo-1131:** read code points in protected-branch bracket classes ([#189](https://github.com/zgeoff/auto-mode/issues/189)) ([bd49240](https://github.com/zgeoff/auto-mode/commit/bd49240bb83fc792736a2340286f21e601d3aaa0))

## [0.21.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.20.1...auto-mode-v0.21.0) (2026-10-15)


### ⚠ BREAKING CHANGES

* **geo-977:** treat an unreadable classifier verdict as a model failure ([#164](https://github.com/zgeoff/auto-mode/issues/164))

### Bug Fixes

* **geo-960:** exclude files that run code later from the edit bypass ([#169](https://github.com/zgeoff/auto-mode/issues/169)) ([c325426](https://github.com/zgeoff/auto-mode/commit/c325426c9d6fc4c29ab08185123d76f858a6d2c6))
* **geo-962:** send a hook-skipping commit or push to policy tampering ([#166](https://github.com/zgeoff/auto-mode/issues/166)) ([d87c044](https://github.com/zgeoff/auto-mode/commit/d87c0449f8196d05f8e798d2a6fc7a8ca8dc6242))
* **geo-965:** escalate a regenerable delete with no task scope ([#168](https://github.com/zgeoff/auto-mode/issues/168)) ([fbc4b91](https://github.com/zgeoff/auto-mode/commit/fbc4b915c713ee477e069c769c3c3ba5b1666f9f))
* **geo-966:** take over a stale state lock by rename ([#165](https://github.com/zgeoff/auto-mode/issues/165)) ([b30d0cb](https://github.com/zgeoff/auto-mode/commit/b30d0cb25293cb9675f4abc5e6e0542a234ae666))
* **geo-977:** treat an unreadable classifier verdict as a model failure ([#164](https://github.com/zgeoff/auto-mode/issues/164)) ([9c2c095](https://github.com/zgeoff/auto-mode/commit/9c2c09536a9820633c5ba234757e67d67a306fd7))


### Miscellaneous Chores

* release 0.21.0 ([#170](https://github.com/zgeoff/auto-mode/issues/170)) ([5887bd2](https://github.com/zgeoff/auto-mode/commit/5887bd221689379376668a45c629e7f513fb2eee))

## [0.20.1](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.20.0...auto-mode-v0.20.1) (2026-10-15)


### Bug Fixes

* **geo-934:** allow a read-only command only for a safe argument shape ([#160](https://github.com/zgeoff/auto-mode/issues/160)) ([e8e90b3](https://github.com/zgeoff/auto-mode/commit/e8e90b3870c85cdc597cc6a232a4bf1e60bf2cc8))

## [0.20.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.19.3...auto-mode-v0.20.0) (2026-10-14)


### Features

* **geo-163:** let a user-named target send a scope deny to the judge ([#155](https://github.com/zgeoff/auto-mode/issues/155)) ([5c2f2ba](https://github.com/zgeoff/auto-mode/commit/5c2f2baedc05e303482f845246870cc0d800fb11))
* **geo-390:** deny discarding work by hard reset or branch sweep ([#154](https://github.com/zgeoff/auto-mode/issues/154)) ([20135b3](https://github.com/zgeoff/auto-mode/commit/20135b3284eea4f1ffedc5409335f83ca818ac03))
* **geo-394:** record the agent identity in the action log ([#148](https://github.com/zgeoff/auto-mode/issues/148)) ([02fc436](https://github.com/zgeoff/auto-mode/commit/02fc436a76f060d1cc5700c7fd57bce6d8d98950))
* **geo-408:** judge only jev denies in the infrastructure-failures run ([#151](https://github.com/zgeoff/auto-mode/issues/151)) ([4df9eec](https://github.com/zgeoff/auto-mode/commit/4df9eeca369e8b971fc6cb1819dff3f7e07cfe8b))


### Bug Fixes

* **geo-389:** score live eval runner samples with the shipped verdict ([#153](https://github.com/zgeoff/auto-mode/issues/153)) ([28e68fb](https://github.com/zgeoff/auto-mode/commit/28e68fb87d0a84f7141666f73b38d9cdfeb5fe57))
* **geo-771:** read a # after a line continuation as part of its word ([#156](https://github.com/zgeoff/auto-mode/issues/156)) ([f0ca9b0](https://github.com/zgeoff/auto-mode/commit/f0ca9b0c51d13c7d112181413fc8ed8b489c9789))
* **geo-876:** read a token-free xargs replace as its fixed command ([#157](https://github.com/zgeoff/auto-mode/issues/157)) ([824f773](https://github.com/zgeoff/auto-mode/commit/824f77309efd14839c36620ec22571dde1332350))
* **geo-886:** skip gh pr option values per subcommand ([#159](https://github.com/zgeoff/auto-mode/issues/159)) ([00515c4](https://github.com/zgeoff/auto-mode/commit/00515c479b8cca62a0fcbf8b4e00c7e784e6b902))
* **geo-891:** find a branch sweep through the token-append xargs mode ([#158](https://github.com/zgeoff/auto-mode/issues/158)) ([c1f1a34](https://github.com/zgeoff/auto-mode/commit/c1f1a34c7c8730e45a6d6ea90452253f006132e6))

## [0.19.3](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.19.2...auto-mode-v0.19.3) (2026-10-13)


### Bug Fixes

* **geo-725:** stop the anonymiser replacing words after a prose push ([#145](https://github.com/zgeoff/auto-mode/issues/145)) ([2a2b573](https://github.com/zgeoff/auto-mode/commit/2a2b573929e3fd436d7ce711fa02c55a065b086c))

## [0.19.2](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.19.1...auto-mode-v0.19.2) (2026-10-12)


### Bug Fixes

* **geo-475:** stop default-branch denies on fixture edits ([#143](https://github.com/zgeoff/auto-mode/issues/143)) ([8047f82](https://github.com/zgeoff/auto-mode/commit/8047f82a070db37936891c5bb0e8fe8b7858dffb))

## [0.19.1](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.19.0...auto-mode-v0.19.1) (2026-10-12)


### Bug Fixes

* **geo-223:** lock both state files and cap every spawn in one helper ([#135](https://github.com/zgeoff/auto-mode/issues/135)) ([374b2d3](https://github.com/zgeoff/auto-mode/commit/374b2d3ef171643758409c881956e220511575d2))

## [0.19.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.18.0...auto-mode-v0.19.0) (2026-10-11)


### Features

* **geo-407:** let any judge overturn clear a soft rule by default ([#131](https://github.com/zgeoff/auto-mode/issues/131)) ([930aa40](https://github.com/zgeoff/auto-mode/commit/930aa40b7feef90f8c6dfc92ab59ca20264f296e))

## [0.18.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.17.0...auto-mode-v0.18.0) (2026-10-11)


### Features

* **geo-220:** share one dependency-free contract with the mod ([#122](https://github.com/zgeoff/auto-mode/issues/122)) ([3dd9690](https://github.com/zgeoff/auto-mode/commit/3dd96903b0e939477cea9db9459be4a516aa09c9))

## [0.17.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.16.0...auto-mode-v0.17.0) (2026-10-10)


### Features

* **geo-161:** review each jev deny with a judge that confirms or overturns it ([#119](https://github.com/zgeoff/auto-mode/issues/119)) ([abc83d1](https://github.com/zgeoff/auto-mode/commit/abc83d15069355ae959a870658ef604df120c72b))
* **geo-219:** enforce module boundaries with a check:imports script ([#121](https://github.com/zgeoff/auto-mode/issues/121)) ([e8ca645](https://github.com/zgeoff/auto-mode/commit/e8ca64510c53e066bc3c18932bebd826aa628892))
* **geo-336:** add opt-in request capture and an anonymise step ([#118](https://github.com/zgeoff/auto-mode/issues/118)) ([d5329d8](https://github.com/zgeoff/auto-mode/commit/d5329d8dbe74127367efffacde529dddb4f8ad4d))
* **geo-339:** add the measurement experiments ([#114](https://github.com/zgeoff/auto-mode/issues/114)) ([efc9b52](https://github.com/zgeoff/auto-mode/commit/efc9b52ad91b3e1ee02255cc6f65e098dd675966))
* **geo-340:** measure escalations and recovery from the action log ([#115](https://github.com/zgeoff/auto-mode/issues/115)) ([62316c0](https://github.com/zgeoff/auto-mode/commit/62316c0841c99a32c4559483cdc7afd021fca0f3))
* **geo-90:** mark the earlier direct message stale after a relayed turn ([#120](https://github.com/zgeoff/auto-mode/issues/120)) ([9439005](https://github.com/zgeoff/auto-mode/commit/9439005d5b2bf550e7d9276de9b134732e1bfa51))

## [0.16.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.15.0...auto-mode-v0.16.0) (2026-10-10)


### Features

* **geo-160:** narrow the block rules to catastrophic harm ([#100](https://github.com/zgeoff/auto-mode/issues/100)) ([dfa9024](https://github.com/zgeoff/auto-mode/commit/dfa902449661f9e9cef4bf46fb76d9c1c140fba8))
* **geo-162:** allow unless a rule's block probability reaches the threshold ([#113](https://github.com/zgeoff/auto-mode/issues/113)) ([943dd1c](https://github.com/zgeoff/auto-mode/commit/943dd1c5ba0445db61a2501df8c01e9480055a89))
* **geo-335:** label every evaluation case with severity, harm and consent ([#106](https://github.com/zgeoff/auto-mode/issues/106)) ([763ee39](https://github.com/zgeoff/auto-mode/commit/763ee39d5a2de3a517b4990fc3b2176b5c42123c))
* **geo-337:** add the eval command core ([#112](https://github.com/zgeoff/auto-mode/issues/112)) ([6de7e3f](https://github.com/zgeoff/auto-mode/commit/6de7e3ffb8fa48b9435346df4abd1889326ccdcf))

## [0.15.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.14.0...auto-mode-v0.15.0) (2026-10-08)


### Features

* **geo-181:** judge mcp calls, commits and in-scope pushes by facts ([#82](https://github.com/zgeoff/auto-mode/issues/82)) ([05609c0](https://github.com/zgeoff/auto-mode/commit/05609c0a8819e216b11cc81ea559f8502b97ffc1))

## [0.14.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.13.0...auto-mode-v0.14.0) (2026-10-08)


### Features

* **geo-178:** read the atc session record as a scope source ([#62](https://github.com/zgeoff/auto-mode/issues/62)) ([0463bcb](https://github.com/zgeoff/auto-mode/commit/0463bcb30a70631f50c7e4c6dbb409260e1e0f56))

## [0.13.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.12.0...auto-mode-v0.13.0) (2026-10-08)


### Features

* **geo-159:** give jev and the judge the remotes and task scope ([#60](https://github.com/zgeoff/auto-mode/issues/60)) ([fb1d817](https://github.com/zgeoff/auto-mode/commit/fb1d8171aa399b8a23fcc960d38618d5ca76b8b7))

## [0.12.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.11.0...auto-mode-v0.12.0) (2026-10-08)


### Features

* **geo-157:** let in-scope file edits skip the classifier ([#58](https://github.com/zgeoff/auto-mode/issues/58)) ([2957dd8](https://github.com/zgeoff/auto-mode/commit/2957dd8c1a7f42236fdc497b207e3f3b7c99bca7))

## [0.11.0](https://github.com/zgeoff/auto-mode/compare/auto-mode-v0.10.0...auto-mode-v0.11.0) (2026-10-08)


### Features

* **geo-156:** derive the task scope from pluggable scope sources ([#56](https://github.com/zgeoff/auto-mode/issues/56)) ([0bb9e47](https://github.com/zgeoff/auto-mode/commit/0bb9e47f002f36e8dd3d9e967ae7c559327dcb61))

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
