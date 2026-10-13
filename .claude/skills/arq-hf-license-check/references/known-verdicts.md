# Known verdicts (أحكام سابقة)

Seeded on 2026-10-12 from the verified Hub review behind the ARQ Hugging Face plan (§5 «انتبه»). Every row was re-opened on the Hub with `hub_repo_details` and `hf_fs` by an adversarial verifier. Facts the verifiers dropped are not listed here.

**How to use:** reuse a row only for the same use. Check again if the repo's Hub "Updated" date is after the row's date, or if the use changes. Privacy is judged per integration (SKILL.md Step 3). A row marked تجاري مسموح still goes through the privacy gate before any ARQ user data reaches a provider.

Links: models are at `https://huggingface.co/OWNER/NAME`, datasets at `https://huggingface.co/datasets/OWNER/NAME`, Spaces at `https://huggingface.co/spaces/OWNER/NAME`.

## تجاري مسموح

| Repo | License evidence | Notes for ARQ |
|---|---|---|
| Qwen/Qwen3.8-27B | apache-2.0 | VLM fallback for analyze-meal. Sending meal photos to a provider needs the privacy gate. |
| Qwen/Qwen3.6-35B-A3B | apache-2.0 | Same privacy note. scaleway is the EU option. |
| Qwen/Qwen3Guard-Gen-4B, Qwen/Qwen3Guard-Gen-0.6B | apache-2.0; LICENSE file present | Sending private chat to a provider needs disclosure and the privacy gate. |
| Qwen/Qwen3-ASR-1.7B | apache-2.0 | Health voice is sensitive: testers only, with consent. |
| openai/whisper-large-v3 | apache-2.0 | ASR fallback. |
| ibm-granite/granite-embedding-97m-multilingual-r2 | apache-2.0; card says the training data was permissive or IBM-owned | Arabic search embeddings. |
| BAAI/bge-m3, BAAI/bge-reranker-v2-m3 | MIT / apache-2.0 | Alternative to granite. |
| google/gemma-4-26B-A4B-it | apache-2.0; the card's license_link is labelled "Apache 2.0" and is not the old Gemma terms | Gemma 3 and earlier still use the Gemma terms. |
| Freepik/nsfw_image_detector | MIT (card License section); not gated | Do not use the community ONNX `sitatech/freepik_nsfw_detector_onnx` (no license); export it ourselves. |
| Marqo/nsfw-image-detection-384 | apache-2.0 | On-device base. |
| Falconsai/nsfw_image_detection | apache-2.0 | Do not use the YOLOv9 `.pt` file in the same repo. |
| black-forest-labs/FLUX.2-klein-4B | apache-2.0; card: "Open weights available for commercial use under the Apache 2.0 license" | Only the 4B. The 9B is ممنوع. |
| Tongyi-MAI/Z-Image-Turbo | apache-2.0 | Has an official MCP Space; use it for public marketing drafts only. |
| Qwen/Qwen-Image-Edit-2511, Qwen/Qwen-Image-2512 | apache-2.0 | Not Qwen-Image-2.1 (ممنوع). |
| ZhengPeng7/BiRefNet (MCP Space not-lain/background-removal) | MIT; the Space README also declares `license: mit` | Send only public product images to the Space. |
| PaddlePaddle/arabic_PP-OCRv5_mobile_rec_onnx, PaddlePaddle/PP-OCRv5_mobile_det_onnx | apache-2.0 | On-device Arabic OCR. |
| PaddlePaddle/PaddleOCR-VL-1.6 | apache-2.0 | `partner_docs` may only be processed on a self-hosted instance. |
| google/siglip2-base-patch16-224 (onnx-community/siglip2-base-patch16-224-ONNX) | apache-2.0 base; the ONNX repo has no tag but is a conversion of the Apache base | |
| CAMeL-Lab/bert-base-arabic-camelbert-da-sentiment, CAMeL-Lab/bert-base-arabic-camelbert-mix-did-madar-corpus26 | apache-2.0 | Sentiment, and a Najdi-vs-MSA check in CI. |
| silma-ai/silma-tts | apache-2.0; card: "research and commercial use" | Self-host. |

## مسموح بشروط

| Repo | License evidence | Conditions |
|---|---|---|
| openfoodfacts/product-database (dataset) | README "Conditions for reuse": ODbL (database), DbCL (contents), CC-BY-SA (images). The Hub's agpl-3.0 tag covers the code only. | Store rows in a separate `off_products` table with a `source` column. Never merge them into the shared `barcode_products` (ODbL 4.6). Show the OFF credit in the app. Images are share-alike. |
| openfoodfacts/nutrient-detection-layout (dataset) | cc-by-sa-3.0 | Evaluation only; derivatives must be share-alike. Has no Arabic labels. |
| ai5labsOfficial/nutrition5k (dataset) | cc-by-4.0 (mirror of Google Nutrition5k) | Attribution required. Pull from the official `gs://nutrition5k_dataset` bucket. |
| RepDB/exercise-dataset (dataset) | RepDB Free Tier License v1.0 (read in full) | In-app use only, with the visible credit "Exercise data by RepDB (repdb.co)". No redistribution as a dataset or API, so the table needs RLS for signed-in users. No use of its images with generative models. `premium-samples/` is for evaluation only. |
| gravitee-io/distilbert-multilingual-toxicity-classifier | openrail++; LICENSE file present | Pass its use restrictions through in ARQ's terms. |
| QCRI/Fanar-2-27B-Instruct | apache-2.0 tag, but the base `google/gemma-3-27b-pt` is `license:gemma` | Apply the Gemma Prohibited Use Policy. Self-host only (no provider). |
| google/translategemma-4b-it | Gemma license; gated with manual approval | Gemma pass-through terms apply. The owner must accept the gate. |
| Helsinki-NLP/opus-mt-tc-big-ar-en | cc-by-4.0 | Attribution in the app or dashboard credits. |
| NAMAA-Space/NAMAA-Saudi-TTS | MIT; card: "research and commercial usage with proper attribution" | Attribution required. The V2 line is non-commercial (see ممنوع). |
| ResembleAI/chatterbox | MIT | Disclose the Perth watermark. Clone voices only with consent. |
| mistralai/Voxtral-Mini-4B-Realtime-Arabic | Apache 2.0, stated only in the README License section; no metadata tag | Cite the README text. Self-host. Released very recently. |
| HeshamHaroon/saudi-dialect-conversations (dataset) | apache-2.0 tag; card says it was generated with GPT-4o | Use only as a style reference or for few-shot examples. Do not train on it without legal review. |

## ممنوع

| Repo | Reason |
|---|---|
| black-forest-labs/FLUX.2-klein-9B | License `other` (non-commercial); gated. Live on fal-ai, replicate and wavespeed, and its Space is tagged `mcp-server`. None of that grants commercial rights (re-checked 2026-10-12). |
| Qwen/Qwen-Image-2.1, Qwen-Image-2.1-Turbo | Qwen Research license (LICENSE dated 2026-09-20). |
| briaai/RMBG-1.4 | License `other`; card: "source-available model for non-commercial use". It is the default in many transformers.js demos. |
| Shakker-Labs/RepText | Built on FLUX.1-dev, so it inherits the non-commercial terms. |
| giacomoarienti/nsfw-classifier | cc-by-nc-nd-4.0, even though hf-inference serves it live. |
| CohereLabs/aya-vision-32b | cc-by-nc-4.0; gated. Live on cohere. |
| openfoodfacts/nutrition-extractor | cc-by-nc-sa-4.0. |
| openfoodfacts/nutrition-table-yolo, front_image_classification, crop-detection, ingredient-detection, category_classifier | agpl-3.0 (Ultralytics YOLO). |
| YOLO26-pose ports: software-mansion/react-native-executorch-yolo26-pose, onnx-community/yolo26n-pose-ONNX, qualcomm/YOLO26-Pose | AGPL-3.0, inherited from upstream Ultralytics. |
| Humanbased-AI/MM-Food-100K (dataset) | OpenRAIL-M, "available for non-commercial use". Labels were generated with GPT-4o and Qwen. |
| Non-commercial Arabic and Saudi TTS: facebook/mms-tts-* (cc-by-nc-4.0); NAMAA-Space/NAMAA-Saudi-TTS-V2, SWivid/Habibi-TTS, khalidhabbash/Saudi-tts-v4 (cc-by-nc-sa); AhmedEladl/Magpie-TTS-Saudi-Arabic, Rabe3/saudi-xtts-v2 (cc-by-nc-4.0); VohoAI/voho-saudi-speak-0.6b (cc-by-nc-sa-4.0) | Non-commercial. |
| AyoubChLin/Qwen3.5-9B-saudi-dialect | No license, and trained on GPT-4o-generated data. |
| Ammar-alhaj-ali/arabic-MARBERT-dialect-identification-city | No license tag. |
| sitatech/freepik_nsfw_detector_onnx | Community conversion with no license field. |

## غير واضح (treat as ممنوع until resolved)

| Repo | Why | What would resolve it |
|---|---|---|
| humain-ai/ALLaM-7B-Instruct-preview | Tagged apache-2.0, but the README says "Please see the LICENSE file" and the repo has no LICENSE file. | Written confirmation from HUMAIN. |
| Qwen/Qwen3.8-Flash-Next | License `other`. | Read the full license text. |
| audarai/Audar-ASR-V1-Turbo | Custom community license: "research and limited commercial use for qualifying Community Entities". The full text is off the Hub and unread. | Read the AudarAI license or get an enterprise quote. |
| NAMAA-Space/Ara-Prompt-Guard_V0 (and V1) | Tagged apache-2.0, but the base `meta-llama/Llama-Prompt-Guard-2-86M` is under the gated Llama license. | Llama terms most likely apply. |
| datalab-to/chandra-ocr-2 | Modified OpenRAIL-M. Free only for startups under $2M in funding or revenue, and not for use that competes with their API. | The owner confirms ARQ is under the cap, and its restrictions are passed through. |
| CohereLabs/cohere-transcribe-arabic-07-2026 | apache-2.0 tag; gated (auto). The card and gate terms could not be read. | The owner accepts the gate, then we read the terms. |
| inception42/Jais-2-8B-Chat | apache-2.0 tag; gated (auto). The card could not be read. | Same as above. |
| silma-ai/arabic-broad-benchmark (dataset) | apache-2.0 tag; gated. The gate terms could not be read. | Same as above. |
| meta-llama/Llama-Guard-4-12B, google/shieldgemma-2-4b-it | Llama 4 and Gemma terms; gated. The terms could not be read. | Same as above. |
| briaai/RMBG-2.0 | License `other`; gated. Live on fal-ai. | Read the gate terms. Until then, assume it is non-commercial like 1.4. |
| stanfordmimi/synthpose-vitpose-base-hf | Tagged apache-2.0, but trained on BEDLAM (gated, license `other`, research terms). | Confirmation of BEDLAM's commercial terms. |
| ssalahmari/Saudi_Traditional_Food (dataset) | Tagged MIT, but the authors' augmented copy is cc-by-nc-nd-4.0. | Not for production. Internal offline evaluation only, with owner approval. |
| Ahmed-Selem/Shifaa_Arabic_Medical_Consultations (dataset) | apache-2.0 tag, but the card says it was scraped from islamweb. | Internal evaluation only, or have Claude write the test questions instead. |
| moazeldegwy/Arabic-Nutrition-QA (dataset) | apache-2.0 tag, but no stated source; the rows look scraped. | Internal evaluation only. |
| jc-builds/CalorieCLIP | MIT on the card, but its training data includes Food-101, whose license is unknown. | Not recommended anyway (unreliable claims). |
| EduardoPacheco/FoodSeg103 (dataset) | apache-2.0 tag, but the images come from Recipe1M. | Image rights from Recipe1M. |
| Xenova/opus-mt-ar-en | No license tag; it is an ONNX port of the older opus-mt-ar-en. | Use Helsinki-NLP/opus-mt-tc-big-ar-en instead. |
| MediaPipe Pose Landmarker (Google `.task`) | Apache-2.0 according to Google's model card, but only as quoted on a Hub mirror. | Confirm on Google's own model card before shipping. |
