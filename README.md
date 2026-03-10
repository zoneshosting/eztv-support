# EZTV-Support Voice Support - AI Technical Assistant

A world-class technical support application template, leveraging the **Gemini Live API** for real-time voice interactions and **Gemini 3 Flash** for intelligent chat support. This project is designed to be a template for multiple support instances (e.g., EZTV-Support, CableBusters).

## 🏢 Multi-Instance Templating

This project supports multiple company instances from a single codebase.

### 1. Adding a New Instance

1. Create a new JSON file in the `configs/` directory (e.g., `cablebusters.json`).
2. Define the company info, theme, system prompt, and knowledge base.

### 2. Local Development

To run a specific instance locally:

```bash
# Run EZTV-Support (Default)
npm run dev

# Run CableBusters
$env:INSTANCE_CONFIG="cablebusters"; npm run dev
```

### 3. Deployment (GitHub Actions)

The project includes a GitHub Action `Deploy Instance` that allows you to:

1. Select the `company_id` from a dropdown.
2. Automatically build with the correct config.
3. Deploy to the corresponding Netlify site.

**Prerequisites for Deployment:**

- Add `API_KEY` to GitHub Secrets.
- Add `NETLIFY_AUTH_TOKEN` to GitHub Secrets.
- Add `NETLIFY_SITE_ID_[company_id]` for each instance (e.g., `NETLIFY_SITE_ID_BIRDSEYE`).

## 🚀 Key Features

... (rest of the features)

- **Live Voice Agent**: Low-latency, human-like voice interaction using the `gemini-2.5-flash-native-audio` model.
- **Interactive Knowledge Base**: A high-contrast, searchable FAQ system with accordion-style documentation for instant self-service.
- **Integrated Support Messenger**: AI-powered text chat for customers who prefer typing over talking.
- **Escalation System**: Specialized forms for reporting outages and escalating complex technical issues to human technicians.
- **Mobile Optimized**: A responsive, mobile-first design that prioritizes immediate access to support tools.
- **Billing Integration**: Quick access to Stripe and Cash App payment portals for seamless account renewals.

## 🛠️ Tech Stack

- **Frontend**: React 19 (ESM)
- **Styling**: Tailwind CSS
- **AI Models**:
  - `gemini-2.5-flash-native-audio-preview-09-2025` (Voice)
  - `gemini-3-flash-preview` (Chat)
- **Audio Processing**: Custom PCM encoding/decoding for raw audio streams.

## 📦 Project Structure

```text
.
├── App.tsx           # Main application logic and UI
├── constants.ts      # Knowledge base data and system prompts
├── index.html        # Entry point and meta configuration
├── index.tsx         # React mount point
├── metadata.json     # App permissions (Microphone)
└── utils/
    └── audioUtils.ts # High-performance audio streaming utilities
```

## 🛠️ Getting Started

1. **Prerequisites**: Ensure you have an API key from Google AI Studio.
2. **Environment**: The app expects `process.env.API_KEY` to be available in the execution context.
3. **Permissions**: The app requires microphone access for the Voice Agent features.

## 📜 Support Guidelines

The AI agent (EZTV-Support) is programmed with the following critical protocols:

- **Renewal Price**: $35/month for existing customers.
- **New Account**: $60 total ($25 activation + $35 first month).
- **Payment Identification**: Customers must include "tech-support" in payment notes for automated tracking.

---
*EZTV-Support © 2025. All Rights Reserved.*
