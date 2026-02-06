# ZonesTV Voice Support - AI Technical Assistant

A world-class technical support application for ZonesTV customers, leveraging the **Gemini Live API** for real-time voice interactions and **Gemini 3 Flash** for intelligent chat support.

![ZonesTV Logo Concept](https://img.shields.io/badge/ZonesTV-Tech_Support-black?style=for-the-badge)
![Built with Gemini](https://img.shields.io/badge/Built_with-Gemini_Live_API-blue?style=for-the-badge)

## 🚀 Key Features

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

The AI agent (Zones) is programmed with the following critical protocols:
- **Renewal Price**: $35/month for existing customers.
- **New Account**: $60 total ($25 activation + $35 first month).
- **Payment Identification**: Customers must include "tech-support" in payment notes for automated tracking.

---
*ZonesTV © 2025. All Rights Reserved.*
