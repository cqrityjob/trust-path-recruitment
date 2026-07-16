## CQrityjob — Iteration 1: Public Site Foundation

Build the marketing/public site only. No auth, no dashboards, no backend yet. Establish the design system and internationalization foundation so later iterations can plug in cleanly.

### Scope

Routes, each with its own metadata and support for Swedish and English:

- `/` — Home: hero with “Where trust comes first.”, value pillars, target segments, featured capabilities preview and CTA
- `/about` — Mission, vision, why CQrityjob focuses exclusively on the security industry, and the Sweden-to-international growth direction
- `/services` — Recruitment, Job Board, Interim & Consulting, Assessment and Verification, clearly marked as “coming soon” where appropriate
- `/employers` — Value proposition for security companies, government agencies, critical infrastructure, data centers and corporate security departments
- `/candidates` — Value proposition for security professionals
- `/contact` — Frontend-only contact form with no submission wiring yet

The contact page must clearly state that the form is currently a preview and does not submit or store information.

### Shared site structure

Use the existing root layout or equivalent shared application shell.

Create:

- Sticky header with:
  - CQrityjob wordmark
  - Main navigation
  - Swedish and English language switcher
  - Subtle disabled “Sign in” link with tooltip or label “Coming soon”
- Footer with:
  - Sitemap
  - Legal placeholders
  - Language switcher
  - Tagline: “Where trust comes first.”

### Design System

Use the visual direction “Navy Trust” with Sora for display typography and Manrope for body typography.

Define semantic design tokens in the project’s global stylesheet.

Core palette:

- Background: near-white `#f7f9fc`
- Foreground: deep navy `#0f1b3d`
- Primary: `#0f1b3d`
- Primary foreground: white
- Accent: `#3b6fa0`, used sparingly
- Muted: `#e8edf3`
- Border: subtle cool gray

Typography:

- Display font: Sora
- Body font: Manrope
- Load fonts through document head links, never through remote CSS `@import`

Visual rules:

- Tight radius scale, approximately `0.5rem` base
- Generous spacing
- Restrained shadows
- Thin one-pixel borders
- Clean Linear/Stripe-inspired visual quality
- No purple gradients
- No generic hero blobs
- No excessive visual effects
- No scattered micro-interactions

Hero direction:

- Large editorial Sora heading
- Short Manrope supporting text
- One primary CTA
- One quiet secondary text or ghost link
- One subtle fade-and-rise entrance animation only

Section structure:

- Full-width sections
- Generous vertical spacing
- Occasional two-column layouts
- Lucide icons with thin strokes
- Monochrome navy iconography
- Icons used sparingly

Define dark-mode tokens for future use, but do not implement a dark-mode toggle in this iteration.

### Internationalization

Create a lightweight internationalization structure using the project’s existing framework and conventions.

Requirements:

- Swedish is the default language
- English is available through a language switcher
- Use separate Swedish and English translation dictionaries
- Use a translation hook or equivalent abstraction
- Store the selected language in `localStorage`
- Read the stored language on the client to avoid hydration mismatches
- Server-side rendering should default to Swedish
- Set the document language attribute dynamically on the client
- All visible page copy must come from translation dictionaries
- Do not hardcode page text inside components

### SEO and metadata

Replace all generic Lovable branding and placeholder metadata.

Requirements:

- Real CQrityjob title structure
- Real brand description
- No default “Lovable App” title
- No placeholder Open Graph image
- Unique title and description for every route
- Unique Open Graph title and description for every route
- Twitter card metadata
- Canonical tag for every route
- Semantic HTML
- One H1 per page

Add Organization JSON-LD on the homepage with:

- Name: CQrityjob
- Slogan: Where trust comes first.
- URL: [https://www.cqrityjob.com](https://www.cqrityjob.com)

Do not include `sameAs` until real verified social profiles are available.

### Out of scope

Do not build:

- Authentication
- Employer dashboards
- Candidate dashboards
- Job board data
- Assessment functionality
- AI workflows
- Verification workflows
- Database
- Lovable Cloud
- Contact form backend
- Payment functionality
- Real customer logos
- Fake customer testimonials

Use restrained placeholders only where necessary.

### Technical Notes

- Use the project’s existing framework, routing structure and component conventions.
- Do not replace or migrate the framework unless technically necessary.
- Create one route for each public page.
- Remove the current placeholder homepage.
- Use semantic design tokens for all colors.
- Avoid hardcoded color values inside components.
- Create reusable shared components for:
  - SiteHeader
  - SiteFooter
  - Section
  - Container
  - PrimaryButton
  - LanguageSwitcher
- Keep components modular and maintainable.
- Structure the code so authentication, dashboards, job listings and the Assessment Platform can be added in future iterations.
- Do not add a database, authentication provider, backend service or paid external integration.
- Do not rewrite working configuration files unless required for this iteration.
- Do not create fake backend behaviour for the contact form.

### Quality checks before completion

Before finishing, verify:

- No TypeScript errors
- No broken routes
- No missing translation keys
- No hydration warnings
- No generic Lovable branding
- No hardcoded page copy
- Responsive layout works on desktop, tablet and mobile
- Header and footer are consistent across all routes
- Swedish is the default language
- English toggle works
- The selected language persists after refresh
- Every route has distinct metadata
- The placeholder homepage is fully removed

### Deliverable check

The following routes must render successfully:

- `/`
- `/about`
- `/services`
- `/employers`
- `/candidates`
- `/contact`

All routes must render in Swedish by default, support English through the language switcher, use the shared design system and include consistent header, footer and route-specific metadata.