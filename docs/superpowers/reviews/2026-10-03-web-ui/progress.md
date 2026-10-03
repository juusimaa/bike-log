# SDD ledger — plan: docs/superpowers/plans/2026-10-02-web-ui.md

Owner approved plan and referenced technical design, selected subagent-driven worktree execution on2026-10-02.
Plan commit/main:5765b6a; implementation branch feat/web-ui; worktree /Users/jouniuusimaa/Code/bike-log/.worktrees/web-ui.
Ruling: Commit authorization applies to planning artifacts only; implementation remains uncommitted with snapshots/diff packages until owner chooses integration. Cost if wrong: extra commit step later, preserves explicit authorization boundary.
Ruling: Existing development PostgreSQL and volume shared across worktrees; use unique synthetic test data and stop only task-started processes/container. Cost if wrong: synthetic local records accumulate; no original history lost.
Ruling: Archived v1 remains byte-for-byte unchanged; screenshot evidence and additive controls presented for human review at handoff, never inferred approval from a new golden file. Cost if wrong: owner may request visual rework.

## Preflight task/shared-interface scan

| Tasks | Shared surface / checks                                                        | Result                                                              |
| ----- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 1     | Files/interfaces/tests/steps internally checked                                | Consistent; optional commit deferred                                |
| 2     | Files/interfaces/tests/steps internally checked                                | Consistent; optional commit deferred                                |
| 3     | Files/interfaces/tests/steps internally checked                                | Consistent; optional commit deferred                                |
| 4     | Files/interfaces/tests/steps internally checked                                | Consistent; optional commit deferred                                |
| 5     | Files/interfaces/tests/steps internally checked                                | Consistent; optional commit deferred                                |
| 6     | Files/interfaces/tests/steps internally checked                                | Consistent; optional commit deferred                                |
| 7     | Files/interfaces/tests/steps internally checked                                | Consistent; optional commit deferred                                |
| 8     | Files/interfaces/tests/steps internally checked                                | Consistent; optional commit deferred                                |
| 9     | Files/interfaces/tests/steps internally checked                                | Consistent; optional commit deferred                                |
| 1,2   | Generated DTOs/client/tooling                                                  | Sequential, producer interface consumed as pinned; no contradiction |
| 1,3   | Generated DTOs/client/tooling                                                  | Sequential, producer interface consumed as pinned; no contradiction |
| 1,4   | Generated DTOs/client/tooling                                                  | Sequential, producer interface consumed as pinned; no contradiction |
| 1,5   | Generated DTOs/client/tooling                                                  | Sequential, producer interface consumed as pinned; no contradiction |
| 1,6   | Generated DTOs/client/tooling                                                  | Sequential, producer interface consumed as pinned; no contradiction |
| 1,7   | Generated DTOs/client/tooling                                                  | Sequential, producer interface consumed as pinned; no contradiction |
| 1,8   | Generated DTOs/client/tooling                                                  | Sequential, producer interface consumed as pinned; no contradiction |
| 1,9   | Generated DTOs/client/tooling; browser evidence and integration                | Sequential, producer interface consumed as pinned; no contradiction |
| 2,3   | Form helpers/state and captured resource IDs                                   | Sequential, producer interface consumed as pinned; no contradiction |
| 2,4   | Form helpers/state and captured resource IDs                                   | Sequential, producer interface consumed as pinned; no contradiction |
| 2,5   | Form helpers/state and captured resource IDs                                   | Sequential, producer interface consumed as pinned; no contradiction |
| 2,6   | Form helpers/state and captured resource IDs                                   | Sequential, producer interface consumed as pinned; no contradiction |
| 2,7   | Form helpers/state and captured resource IDs                                   | Sequential, producer interface consumed as pinned; no contradiction |
| 2,8   | Form helpers/state and captured resource IDs                                   | Sequential, producer interface consumed as pinned; no contradiction |
| 2,9   | Form helpers/state and captured resource IDs; browser evidence and integration | Sequential, producer interface consumed as pinned; no contradiction |
| 3,4   | Garage navigation/query keys/invalidation                                      | Sequential, producer interface consumed as pinned; no contradiction |
| 3,5   | Garage navigation/query keys/invalidation                                      | Sequential, producer interface consumed as pinned; no contradiction |
| 3,6   | Garage navigation/query keys/invalidation                                      | Sequential, producer interface consumed as pinned; no contradiction |
| 3,7   | Garage navigation/query keys/invalidation                                      | Sequential, producer interface consumed as pinned; no contradiction |
| 3,8   | Garage navigation/query keys/invalidation                                      | Sequential, producer interface consumed as pinned; no contradiction |
| 3,9   | Garage navigation/query keys/invalidation; browser evidence and integration    | Sequential, producer interface consumed as pinned; no contradiction |
| 4,5   | Query invalidation and API error semantics                                     | Sequential, producer interface consumed as pinned; no contradiction |
| 4,6   | Query invalidation and API error semantics                                     | Sequential, producer interface consumed as pinned; no contradiction |
| 4,7   | Query invalidation and API error semantics                                     | Sequential, producer interface consumed as pinned; no contradiction |
| 4,8   | Query invalidation and API error semantics                                     | Sequential, producer interface consumed as pinned; no contradiction |
| 4,9   | Query invalidation and API error semantics; browser evidence and integration   | Sequential, producer interface consumed as pinned; no contradiction |
| 5,6   | Query invalidation and API error semantics                                     | Sequential, producer interface consumed as pinned; no contradiction |
| 5,7   | Query invalidation and API error semantics                                     | Sequential, producer interface consumed as pinned; no contradiction |
| 5,8   | Query invalidation and API error semantics                                     | Sequential, producer interface consumed as pinned; no contradiction |
| 5,9   | Query invalidation and API error semantics; browser evidence and integration   | Sequential, producer interface consumed as pinned; no contradiction |
| 6,7   | Component files, passport and fitting/replacement hooks                        | Sequential, producer interface consumed as pinned; no contradiction |
| 6,8   | Query invalidation and API error semantics                                     | Sequential, producer interface consumed as pinned; no contradiction |
| 6,9   | Query invalidation and API error semantics; browser evidence and integration   | Sequential, producer interface consumed as pinned; no contradiction |
| 7,8   | Query invalidation and API error semantics                                     | Sequential, producer interface consumed as pinned; no contradiction |
| 7,9   | Query invalidation and API error semantics; browser evidence and integration   | Sequential, producer interface consumed as pinned; no contradiction |
| 8,9   | Query invalidation and API error semantics; browser evidence and integration   | Sequential, producer interface consumed as pinned; no contradiction |

## Progress

Task 1: pending
Task 2: pending
Task 3: pending
Task 4: pending
Task 5: pending
Task 6: pending
Task 7: pending
Task 8: pending
Task 9: pending

Baseline:48domain+143integration tests passed; /tmp/bikelog-web-baseline.log. PGrootstarted healthy. Nodehost26.10.0; Task1 must select/use local pinned Node24 without replacing system Node.
Task1: implementing — ui_task1; snapshot task-1-before.

Ruling: Preserve raw OpenAPI snapshot; generated date-time format-only schemas may map to TypeScript string, backed by wire-format regression. Numeric number|string unions use precision-checked numeric-string handling. No backend schema changes. Cost if wrong: generation/type transform needs adjustment for a future wire change.
Task1 setup: local Node24.21.0, Next16.3.8/React19.3.0 resolved; own API5080running forschema, stopaftertask.

Ruling: Adapter validates canonical public Host127.0.0.1:3000 and mutation Originhttp://127.0.0.1:3000, not Next internal normalized request URL; reject forwarded-header substitutions. Production smoke exposed internal origin mismatch. Cost if wrong: valid local requests could be rejected or foreign requests admitted; regression and live smoke required.

Task1: implementation complete, review ui_review1 pending.27JS tests, types/lint/build/schema generatecheck pass; liveprodpage+adapter200/foreignPOST403; ownedAPI/webstopped; PGhealthy. Diff30files592KB.

Task1 fixround1/5: Important safeint32 numericstring unions rejected; originalui_task1 resumed. Minor wiredateoffset/calendar strictness deferred (mayfixsamevalidatorarea). Reviewer cannotverify operationalclaims resolved by retained.localsmokeevidence/processcommands and clean rootarchivehashcheck/backendfilesabsencefromdiff; no automatedproof of historicalchronology beyond retainedREDlogs claimed.

Task1: fixround1/5 (1Importantaddressed,0open;ui_review1_fix1PASS).
Task1: complete — client23/proxy7 tests, typechecks/lint/build/schema+live smoke pass; uncommitted.
Task1: minor(deferred): strictwiredate offset/calendar validation; finalreviewmusttriage.
Task2: implementing — ui_task2; snapshot2-before.

Task2 fixround1/5 pending: ImportanthardcodedHelsinki insteadbrowserlocaltime; originalui_task2resumed.
Ruling: Browser-localtimezone is runtimepolicy; Helsinki DSTcases are deterministic injectedtestfixtures. Useone resolvedzone consistently for wall conversion/display/offset/preservation. Cost if wrong: usermayprefer fixedzone, requiring explicit later setting; preserves approveddraft behavior.
Task2 minor(deferred): strictfractional digitlength currentlyallowstrailingzeros beyondkm3/EUR2; identicalFormError attempts requirecallerremount, considerattemptID. Carry tofinalrevieworconservativesameareafix.
Task2 cannotverify frontendtimezonecopy/fielddisable/navigation/capturedbike/freshversion/queryinvalidations/browserfocus assignedTasks3–9, mandatoryfinalevidence.

Task2: fixround1/5 (Importanttimezone+Minorprecisionaddressed;0open;ui_review2_fix1PASS).
Task2: complete — full58JS tests beforefix,18coveringafterfix+types/lintpassed; reusableinterfacesconfirmed, browserproofTask9.
Task3: implementing — ui_task3; snapshot3-before.

Task3: complete — ui_review3 spec compliant / quality approved;71JS tests/types/lint/build pass.
Task3 minor(deferred): late-response fixture needs distinct usage assertion; actual dirty Back/Forward traversal may discard forward history, Task9 must verify and correct if real; nullable component model explicit label; remove backend implementation wording from overview copy. Final review must triage.
Task3 cannotverify: archive checksums verified controller previously, recheck final; responsive/history/forms/persistence assigned Tasks4–9 mandatory proof.
Task4: implementing — ui_task4; snapshot4-before.

Task4: complete — ui_review4 spec compliant / quality approved;86JS tests/types/lint pass.
Task4 minor(deferred): pristine bike editor persists on clean Back/Forward because onExitAccepted not invoked; Task9 browser history gate must address lifecycle consistently. Final review triage.
Task4 cannotverify: runtime persistence/reload/focus/responsive explicitly mandatory Task9.
Task5: implementing — ui_task5; snapshot5-before.

Task5 fixround1/5: Important ride recovery summaries omit namedride timestamp/preciseinstant, originalui_task5 resumed. Browser/runtime evidence assignedTask9.

Task5: fixround1/5 (1Importantaddressed;0open;ui_review5_fix1PASS).
Task5: complete —106JS beforefix/22coveringafterfix/types/lint;taskreview+scopedreviewapproved,uncommitted. Runtime/browsersTask9.
Task6: implementing — ui_task6; snapshot6-before.

Task6 fixround1/5: Important current/all revisit retains old infinitecursor; originalui_task6 resumed. Minor recoverykm units mayfixsamearea; finaltriage otherwise. Browser/persistenceTask9.

Task6: fixround1/5 (Importantcursorreset+Minorunitsaddressed;0open;ui_review6_fix1PASS).
Task6: complete —119JS beforefix/12coveringafterfix/types/lint;task+scopedreviewsapproved. InitialRED import-only evidencehonestlyrecorded plus laterbehavioralRED. Browser/persistenceTask9.
Task7: implementing — ui_task7; snapshot7-before.

Task7 fixround1/5: Important create201/fit409 leavespersistedpart collectioncached; originalui_task7resumed. Runtime/browsercountsTask9.

Task7: fixround1/5 (1Importantaddressed;0open;ui_review7_fix1PASS).
Task7: complete —128JS beforefinalscopedchanges/9coveringafterfix/types/lint;task+scopedreviewapproved. Runtime/browserTask9.
Task8: implementing — ui_task8; snapshot8-before.

Task8: complete — ui_review8 spec compliant/qualityapproved noissues;145JS/types/lintpassed. Browserbaseline/lifetime/runtimeTask9.
Task9: implementing — ui_task9; snapshot9-before.

Ruling: Retain compatible pinned Next lint toolchain while reporting five high audit entries from one dev-only braces glob-pattern stack-exhaustion advisory GHSA-vfj7-8cjw-p6xm. No compatible patched braces version available; offered eslint-config-next downgrade incompatible with approved Next16. No runtime package advisory reported. Cost if wrong: malicious lint glob input could exhaust local lint process; revisit dependency patch when available. Final review must verify dependency classification and reachability from retained audit artifacts.

Task9 controller screenshot inspection: final desktopconnectedoverview +mobileoverview/maintenance from results1791005399910/1791005411771 viewed. Warmwhite/green/shell/hero/cards retained; currentchain350/recorded787/activity3 aligned; no Nextdevindicator visible; mobile page contained with tablescroll. Humanvisualapproval remainshandoff, notinferred from tests. Finalreviewcheck enGB display vs browserdefault locale.

Task9: complete — ui_review9 speccompliant/qualityapproved;27visual16live2built145JS191backend typeslintbuildacceptancesPASS evidenceinspected byreviewer.
Task9 minor(deferred): latebrowserresponse uses100ms ratherthan awaitprocessedresponse/render; conflictingNO_COLOR/FORCE_COLOR toolwarnings; finalwholebranchtriage.
Task9 cannotverify: ownervisualapproval retainedhandoff; Task1wiredate andcross-taskcases finalreviewmusttriage. Screenshotcomparison is evidence notautomaticapproval.
Final wholebranch review: pending — final_web_review; baseline snapshot1-before/plan5765b6a.

Final wholebranch review: With fixes — final-review-report.md;5Important I1–I5 +8Minor M1–M8. Exactlyonefinalfixwave allfindings; snapshotfinal-fix-before.
Finalreview declined humanvisualapproval/exactpixels: resolved by existing archive/humanreview ruling; retainpairedcaptures ownerreviewsintentionaladditions.
Ruling: Keep physical-device proof, authentication/privacy for real data, hosting/native/backups/offline, and API scalability changes outside this local synthetic milestone as explicitly documented later gates. Cost if wrong: those uses need further implementation and validation before use.
Ruling: Dependency availability conclusions remain tied to the retained current-session registry/audit artifacts and installed tree; require a fresh check at later dependency refresh rather than treating the advisory as fixed. Cost if wrong: a subsequently available patch may be delayed until the next check.
Ruling: Add browser reload/tab-close dirty-input protection in the final fix wave alongside existing in-app navigation guards, using beforeunload only while an editor has unsaved or unresolved work. Cost if wrong: browser-controlled exit confirmation may interrupt intentional reloads; protects pending inputs.
Ruling: Retain honest saved TDD reports and logs rather than claim complete historical proof of unsaved RED/GREEN execution; later behavioral regressions are verified directly. Cost if wrong: chronology evidence remains limited, but no fabricated proof or destructive replay.
Finalfix: implementing — final_web_fix, one permitted finalwave includes I1–I5/M1–M8 +nullablepassportlabel +beforeunload; strictscopedregressions/browserformproof/fullJSfinal.

Finalfix: complete — singlewave I1–I5/M1–M8 +nullablepassportlabel/beforeunload ADDRESSED; final_web_fix_review no newfindings. final-fix-review-report.md retained.
Controller final verification: npmtest143web+29client PASS;webtypes/lint/buildPASS;48domain+143integrationPASS. Logs .local/evidence/task9/controller-final-{js,types,lint,build}.log +controller-backend.log. Finalfixbrowser30visual/18live retainedandreviewed. Representativefinal desktop/mobile styleddialog +mobile toast images controllerinspected.
Lifecycle: task-startedPG stopped with scripts/dev.sh db-down, namedvolume/allrecordsretained. API/webalreadyownedcleanupempty3000/5080. Archivehashesmatch; envignored0600; maingitclean planning5765b6a. Implementationuncommitted in feat/web-ui until ownerintegrationchoice.
Finish: all9tasks +taskreviews +onefinalwholebranch/fix/scopedreviewdone. Waitingseparateintegration andhumanvisualhandoff;preserveledger/snapshots/screenshotsuncommittedhistory untilintegration.
