# IM3 Marketing Website

## Overview

This is a production-ready marketing website for IM3, a professional firm that designs operational software systems for SMEs. The project is a full-stack TypeScript application with a React frontend and Express backend. The site features a premium, corporate-tech aesthetic with interactive hero components, smooth animations, and a sober, non-hype tone focused on systems thinking and operational excellence.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized production builds
- **Routing**: Wouter for lightweight client-side routing
- **Styling**: Tailwind CSS v4 with CSS variables for theming
- **UI Components**: shadcn/ui component library (New York style) with Radix UI primitives
- **State Management**: TanStack React Query for server state
- **Animations**: Framer Motion for interactive animations, custom canvas-based animations for the hero section

### Backend Architecture
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript compiled with tsx for development, esbuild for production
- **API Pattern**: RESTful endpoints prefixed with `/api`
- **Session Management**: Express sessions with connect-pg-simple for PostgreSQL storage

### Data Layer
- **ORM**: Drizzle ORM with PostgreSQL dialect
- **Schema Location**: `shared/schema.ts` - shared between frontend and backend
- **Validation**: Zod schemas generated from Drizzle schemas using drizzle-zod
- **Migrations**: Drizzle Kit for database migrations stored in `/migrations`

### Project Structure
```
├── client/           # React frontend application
│   ├── src/
│   │   ├── components/   # UI components including shadcn/ui
│   │   ├── pages/        # Route page components
│   │   ├── hooks/        # Custom React hooks
│   │   └── lib/          # Utilities (queryClient, audio, etc.)
├── server/           # Express backend
│   ├── index.ts      # Server entry point
│   ├── routes.ts     # API route definitions
│   ├── storage.ts    # Data access layer interface
│   └── vite.ts       # Vite dev server integration
├── shared/           # Shared code between frontend and backend
│   └── schema.ts     # Drizzle database schema
└── script/           # Build scripts
```

### Build System
- Development uses Vite's dev server proxied through Express
- Production builds client with Vite and bundles server with esbuild
- Server dependencies are selectively bundled to optimize cold start times

### Design System
- Custom color palette: Ink (#0B1C2D), Coal (#1F1F1F), Paper (#F4F6F8), Teal (#2FA4A9)
- Typography: Inter and Manrope font families
- Border radius: 18px default
- Premium, minimalist aesthetic with subtle shadows and rounded corners

## External Dependencies

### Database
- **PostgreSQL**: Primary database accessed via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and migrations

### UI Libraries
- **Radix UI**: Accessible component primitives (dialog, dropdown, tabs, etc.)
- **Lucide React**: Icon library
- **Embla Carousel**: Carousel component
- **cmdk**: Command palette component
- **Vaul**: Drawer component

### Audio
- **Web Audio API**: Custom audio engine for subtle UI interaction sounds

### Replit-Specific
- **@replit/vite-plugin-runtime-error-modal**: Error overlay in development
- **@replit/vite-plugin-cartographer**: Development tooling
- **@replit/vite-plugin-dev-banner**: Development banner

### Fonts
- Google Fonts: Inter and Manrope loaded via CDN

## Internationalization (i18n)

### Architecture
- **Context-based system**: React context in `client/src/lib/i18n.tsx`
- **Languages supported**: Spanish (ES) - default, English (EN)
- **Hook**: `useI18n()` returns `{ language, setLanguage, t }` where `t` is the translations object

### Translation Structure
- Translations are organized by section: nav, hero, priorities, services, process, targetAudience, testimonials, offer, faq, contact, footer, credibility, logoStrip, leadMagnet
- Natural adaptations per language (not literal translations)

### Design Decisions
- **Widget remains in English**: The InteractiveHeroWidget uses English text intentionally. Technical dashboards and operational software interfaces typically use English even in Spanish-speaking markets, maintaining authenticity as a professional software demo.
- **Language toggle**: Available in header navigation for desktop and mobile views
- **Benefit-focused copy**: Hero and CTAs focus on client outcomes (reduce hours, errors, chaos) rather than technical descriptions
- **Unified CTA**: All CTAs use "Solicitar diagnóstico gratis" / "Request free diagnosis" for consistency and reduced friction
- **Testimonials with metrics**: All testimonials include specific, quantifiable results

### Page Sections (in order)
1. Header (fixed nav with language toggle)
2. Hero (benefit-focused headline + interactive widget)
3. LogoStrip (client logo carousel)
4. CredibilityStrip (12+ systems, 6 industries, 100% conversion)
5. Services (3 service cards)
6. LeadMagnet (free diagnosis CTA)
7. Process (5-step methodology)
8. TargetAudience (fits/doesn't fit cards)
9. Testimonials (3 client quotes with metrics)
10. Offer (2 engagement models)
11. FAQ (5 expandable questions)
12. Contact (final CTA)
13. Footer (nav links, LinkedIn, email)

### Calendar CTAs
- All CTAs link to: https://calendar.im3systems.com
- Unified label: "Solicitar diagnóstico gratis" (ES) / "Request free diagnosis" (EN)