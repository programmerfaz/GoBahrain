# GoBahrain Architecture Summary

## Architecture (Stated First)

**GoBahrain is a client-server mobile application.**

The app has a React Native client (Expo) that communicates with server-side data/services (primarily Supabase, with optional Express APIs in `backend/`).

## Client Side

- **Platform**: React Native + Expo
- **Entry point**: `App.js` (providers, auth/onboarding gating, navigation root)
- **Navigation**: React Navigation using bottom tabs + nested stacks
- **UI layer**: `src/screens/**` and `src/components/**`
- **State/orchestration**: React hooks + Context providers (`AuthContext`, preferences, theme, saved places)
- **Domain logic**: `src/services/**` (`aiPipeline.js`, `feedService.js`, `personalization.js`, `community.js`, `savedPlans.js`)

## Server Side

- **Primary backend platform**: Supabase (auth, database, storage, RPC)
- **Optional custom API**: Node.js/Express under `backend/`
- **External AI/vector services used by the app flow**: OpenAI and Pinecone

## Client-Server Request Flow

1. User action occurs in a screen/component  
2. Client hook/context triggers a service call  
3. Service sends requests to Supabase/OpenAI/Pinecone or backend endpoint  
4. Response is normalized by service logic  
5. Client state updates and UI re-renders  

## Technology Summary

- **Client**: React Native + Expo  
- **Navigation**: React Navigation  
- **Backend/Data**: Supabase (+ optional Express API)  
- **AI/Vector**: OpenAI + Pinecone  
- **Configuration**: Environment-driven (`EXPO_PUBLIC_*`) via `src/config/**`

