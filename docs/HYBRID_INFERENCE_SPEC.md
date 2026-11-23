# Hybrid inference

Use Firebase AI Logic for both model sources. Web and Android use Gemini Nano on compatible devices. iOS uses Apple Foundation Models. Cloud model configuration defaults to `gemini-3.5-flash-lite`. Rubric creation is always cloud-side after an explicit teacher action.

| Policy | First eligible source | Fallback |
| --- | --- | --- |
| Prefer on-device | Device | Cloud with consent |
| On-device only | Device | Teacher review |
| Cloud only | Consented cloud | Teacher review |
| Cloud first | Consented cloud | Device if cloud is unavailable or uncertain |

A missing model, invalid JSON, invented evidence, incomplete extraction, overly long device input, inconsistent marks, or a model-reported ambiguity can prevent automatic acceptance. Offline cloud work or missing consent leaves an unresolved item queued. Store all response attempts and flag disagreements when scores differ. Inference source is read from the Firebase response.

Chrome needs model initialization during user activation and may need to download model assets. App Check applies to cloud calls. Each platform reports runtime readiness separately from network status.
