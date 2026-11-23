# Test plan

| Check | Acceptance |
| --- | --- |
| Schema and scoring | Reject invalid point sums, duplicate IDs, wrong evidence, invalid JSON, and out-of-range marks. |
| Routing | Assert each allowed source order and prove cloud is never invoked while offline or without consent. |
| Teacher workflow | Create, import, approve, evaluate, review, finalize and export. Exercise the synthetic demo and local persistence. |
| Live inference | Report provider source, successful App Check, validated rubric and grading output. Exercise device-only offline and consent-gated fallback when the hardware can run a local model. |
| Mobile | Build and run applicable unit and UI checks. Report simulator and physical-device results separately. |
| Security | Use emulated Firestore to verify that all reads and writes are denied. Scan Git for credentials and run lint or typechecks. |
| Release | Deploy after local acceptance, open hosted URL, verify the cloud path and new-user flow, and verify shutdown and restart controls. |

Benchmark results must distinguish agreement on valid predictions, coverage of all fixture answers, and unresolved cases. Tests with injected providers demonstrate the policy. They do not establish live model behavior.
