# Jekyll Blog - Claude Code Development Guide

This documentation provides essential information about the Jekyll blog architecture and development workflow for Claude Code agents.

## Project Overview

**Purpose**: Personal technical blog focused on databases, systems programming, concurrency, and performance optimization.

**Tech Stack**: Jekyll 3.8.5, Minima theme (customized), Prism.js syntax highlighting, GitHub Pages hosting

**Repository**: https://github.com/redixhumayun/redixhumayun.github.io
**Live Site**: https://redixhumayun.github.io

## Architecture Overview

### Core Directory Structure
```
/
├── _config.yml              # Jekyll configuration
├── _includes/               # Reusable HTML components
│   ├── sidenote.html        # Sidenote template  
│   ├── marginnote.html      # Marginnote template
│   ├── footnote.html        # Footnote reference template
│   └── footnotes.html       # Footnotes container template
├── _layouts/
│   └── default.html         # Base layout (loads JS/CSS)
├── _posts/                  # Published blog posts
├── _drafts/                 # Draft posts for testing
├── assets/
│   ├── main.scss            # Main stylesheet (imports sidenotes.css)
│   ├── sidenotes.css        # Annotation system styles
│   ├── sidenotes.js         # Annotation system JavaScript
│   └── img/                 # Images organized by topic
├── about.md                 # About page
└── index.html               # Homepage
```

### Key Features & Code Locations

**Annotation System** - Primary feature for content enhancement
- **CSS**: `assets/sidenotes.css` - Responsive positioning, counters, mobile transforms
- **JavaScript**: `assets/sidenotes.js` - Overlap detection, URL navigation, smooth scrolling
- **Templates**: `_includes/sidenote.html`, `_includes/marginnote.html`, `_includes/footnote.html`
- **Integration**: Loaded via `_layouts/default.html`

**Syntax Highlighting** - Prism.js system
- **Configuration**: `_layouts/default.html` and `_includes/head.html` load Prism.js from CDN
- **Languages**: Auto-loaded via Prism.js autoloader (rust, cpp, javascript, python, sql, bash, etc.)

**Responsive Design** 
- **Breakpoints**: Mobile ≤760px, Laptop 761-1200px, Desktop >1200px
- **Critical CSS**: `assets/sidenotes.css` handles all responsive behavior

## Development Workflow

### Git Workflow (REQUIRED)
1. **Always start by syncing with master**:
   ```bash
   git checkout master
   git pull origin master
   ```

2. **Create feature branch with descriptive name**:
   ```bash
   git checkout -b feature/descriptive-name
   # or fix/bug-description, enhance/improvement-name
   ```

3. **Work autonomously using available tools** until blocked

4. **Test thoroughly before committing**:
   ```bash
   bundle exec jekyll serve --drafts
   # Verify build works and visual elements display correctly
   ```

5. **Create PR with descriptive title and summary**
   - Include what was implemented
   - Note any breaking changes
   - Mention visual/functional testing performed

6. **Address feedback as separate commits**

7. **This documentation should be updated whenever new features introduce new code locations, development patterns, file relationships, or workflow changes that affect how Claude Code operates on this project.**

### Local Development Commands
```bash
# Install dependencies
bundle install

# Serve with drafts (for testing annotations)
bundle exec jekyll serve --drafts

# Production build
bundle exec jekyll build
```

### Testing Requirements
- **Visual verification**: Use browser automation to screenshot pages with new features
- **Build verification**: Ensure `bundle exec jekyll build` succeeds
- **Responsive testing**: Verify mobile/desktop layouts work correctly
- **Cross-browser compatibility**: Test annotation positioning and JavaScript functionality

## Content Guidelines

### Annotation Usage Templates
```markdown
<!-- Sidenotes: numbered margin notes -->
Main text{% include sidenote.html id="sn-1" text="Explanatory content" %} continues.

<!-- Marginnotes: unnumbered margin notes -->  
Important concept{% include marginnote.html id="mn-1" text="Brief aside" %} here.

<!-- Footnotes: traditional references -->
Research