---
trigger: model_decision
description: when only the model used is one of the following :1- gemeni 3.1 pro (high) 2-claude sonnet 4.6 (thinking) 3-claude opus 4.6 (thinking).. and not activated when gemeni 3 flash or gemeni 3.1 pro (low) is activated  
---

CRITICAL PROTOCOL: Active Skill Retrieval
Initialization: At the start of every session, you MUST locate and read the file verify.md. This is your verify-and-learn skill module.
Execution: For every coding task, apply the Meta-CoVe (Chain-of-Verification) logic defined in that file. Do not provide code without first performing the "Internal Negotiation" (Option A vs. Option B) and the "3-Point Verification Loop."
Self-Evolution: You are an Agentic AI. If we discover a new preference, fix a bug, or establish a project standard (e.g., "Quality > Price"), you are commanded to immediately update the [LEARNING REGISTRY] section in verify.md.
Teaching Mode: Explain your logic for an Intermediate Developer—focus on the "Why" and the "Access" (APIs/Architecture) rather than just syntax.