# Jekyll Blog - AI Agent Documentation

This documentation provides comprehensive information about the Jekyll blog structure, features, and development guidelines for AI agents working on this codebase.

## Project Overview

**Purpose**: Personal technical blog focused on databases, systems programming, concurrency, and performance optimization.

**Tech Stack**: 
- Jekyll 3.8.5 static site generator
- Minima theme (customized)
- Prism.js syntax highlighting (replacing Rouge)
- GitHub Pages hosting
- Ruby/Bundler for dependency management

**Owner**: Zaid Humayun (@redixhumayun)
**Blog URL**: https://redixhumayun.github.io
**Repository**: https://github.com/redixhumayun/redixhumayun.github.io

## Directory Structure

```
/
├── _config.yml              # Jekyll configuration
├── _drafts/                 # Draft posts (not published)
│   └── sidenotes-test.md    # Test/demo post for annotation features
├── _includes/               # Reusable HTML components
│   ├── analytics.html       # Google Analytics tracking
│   ├── footnote.html        # Footnote reference template
│   ├── footnotes.html       # Footnotes container template
│   ├── marginnote.html      # Marginnote template
│   └── sidenote.html        # Sidenote template
├── _layouts/                # Page layout templates
│   └── default.html         # Base layout (overrides Minima theme)
├── _posts/                  # Published blog posts
│   ├── 2019-02-14-how-the-internet-speaks.markdown
│   ├── 2025-06-05-the-concurrency-trap-...md
│   └── [other posts]
├── _site/                   # Generated static site (ignored in git)
├── assets/                  # Static assets and styling
│   ├── img/                 # Images organized by post/topic
│   ├── main.scss            # Main stylesheet (imports Minima + custom)
│   ├── sidenotes.css        # Annotation system styles
│   └── sidenotes.js         # Annotation system JavaScript
├── about.md                 # About page
├── concurrency.md           # Category page for concurrency posts
├── index.html               # Homepage
├── Gemfile                  # Ruby dependencies
├── Gemfile.lock            # Locked dependency versions
└── CLAUDE.md               # This documentation file
```

## Key Features Implemented

### 1. Annotation System (Sidenotes, Marginnotes, Footnotes)

**Location**: `assets/sidenotes.css`, `assets/sidenotes.js`, `_includes/sidenote.html`, `_includes/marginnote.html`, `_includes/footnote.html`, `_includes/footnotes.html`

**Purpose**: Elegant system for adding supplementary information without disrupting reading flow.

#### Feature Components:

**Sidenotes**: 
- Numbered references that appear in the right margin on desktop
- Collapse to expandable elements on mobile
- Auto-positioning to prevent overlaps
- Template: `{% include sidenote.html id="unique-id" text="content" %}`

**Marginnotes**:
- Unnumbered margin notes for brief asides
- Same responsive behavior as sidenotes
- Template: `{% include marginnote.html id="unique-id" text="content" %}`

**Footnotes**:
- Traditional bottom-of-page references
- Full URL navigation with hash changes (#fn:1, #fnref:1)
- Browser back button support
- Smooth scrolling enhancement
- Template: `{% include footnote.html id="1" %}` + footnotes container

#### Technical Architecture:

**CSS System** (`assets/sidenotes.css`):
- CSS counters for automatic numbering
- Responsive breakpoints (mobile: ≤760px, laptop: 761-1200px, desktop: >1200px)
- Float-based positioning for margin notes
- Mobile transforms to expandable blocks

**JavaScript System** (`assets/sidenotes.js`):
- Sidenote overlap detection and repositioning
- Footnote URL navigation and smooth scrolling
- Browser history management
- Responsive behavior handling

**Jekyll Integration**:
- Include templates for easy Markdown usage
- Liquid templating for dynamic content
- Automatic loading via `_layouts/default.html`

### 2. Syntax Highlighting System (Prism.js)

**Location**: `_includes/head.html`, `_layouts/default.html`

**Implementation**:
- **Replaced Rouge** with Prism.js for better syntax highlighting
- **CDN delivery** using cdnjs for CSS and JavaScript
- **Autoloader plugin** automatically loads language definitions as needed
- **Prism Tomorrow theme** for dark syntax highlighting

**Supported Languages** (automatically loaded via CDN):
- Rust (`rust`)
- C++ (`cpp`) 
- JavaScript (`javascript`)
- Python (`python`)
- SQL (`sql`)
- Bash (`bash`)
- YAML (`yaml`)
- TypeScript (`typescript`)
- Plus 290+ other languages

**Configuration**:
- CSS: `prism-tomorrow.min.css` theme
- JS: `prism-core.min.js` + `prism-autoloader.min.js`
- Disabled Rouge in `_config.yml` with `syntax_highlighter_opts: disable: true`

### 3. Theme Customization

**Location**: `assets/main.scss`, `_layouts/default.html`, `_includes/head.html`

**Customizations**:
- Custom color scheme (headings: #FF4633, links: #2C9FB4)
- Prism.js syntax highlighting integration
- Responsive layout adjustments
- Google Analytics integration

### 4. Content Organization

**Categories**: 
- `concurrency/` - Concurrency and parallel programming posts
- `databases/` - Database internals and systems
- `performance/` - Performance optimization content
- `systems/` - Systems programming topics

**Post Naming Convention**: `YYYY-MM-DD-post-title.md`

## Development Workflow

### Local Development Commands:

```bash
# Install dependencies
bundle install

# Serve site locally (production posts only)
bundle exec jekyll serve

# Serve with draft posts (includes test content)
bundle exec jekyll serve --drafts

# Build site for production
bundle exec jekyll build

# Run with specific port
bundle exec jekyll serve --port 4001
```

### Adding New Content:

**New Blog Post**:
1. Create file in `_posts/` with format `YYYY-MM-DD-title.md`
2. Add front matter:
   ```yaml
   ---
   layout: post
   title: "Post Title"
   category: databases  # or concurrency, performance, etc.
   ---
   ```
3. Write content using Markdown + annotation includes + code blocks

**Code Blocks** (using Prism.js):
```markdown
```language
your code here
```
```

**Supported language identifiers**:
- `rust` - Rust code
- `cpp` - C++ code  
- `javascript` - JavaScript
- `python` - Python
- `sql` - SQL queries
- `bash` - Shell scripts
- `yaml` - YAML configuration
- `typescript` - TypeScript

**New Draft**:
1. Create file in `_drafts/` with format `title.md` (no date)
2. Use `bundle exec jekyll serve --drafts` to preview

**New Images**:
1. Add to appropriate subdirectory in `assets/img/`
2. Reference in posts with `/assets/img/folder/image.png`

## Annotation System Usage Guide

### When to Use Each Type:

**Sidenotes**: 
- Quick clarifications
- Definitions
- Brief tangential thoughts
- Technical details that enhance but don't interrupt

**Marginnotes**: 
- Visual callouts
- Emphasis without numbering
- Brief asides
- Non-essential but interesting information

**Footnotes**: 
- Academic citations
- References to external sources
- Lengthy explanations
- Information that needs to be shareable via URL

### Implementation Examples:

```markdown
<!-- Sidenote -->
This is main text{% include sidenote.html id="sn-1" text="This clarifies the main text" %} continuing.

<!-- Marginnote -->
Important concept{% include marginnote.html id="mn-1" text="Visual emphasis without numbers" %} here.

<!-- Footnotes -->
Research shows{% include footnote.html id="1" %} this conclusion.

<!-- At end of post -->
{% assign footnotes = "First citation source|Second reference|Third academic paper" | split: "|" %}
{% include footnotes.html notes=footnotes %}
```

## Modifying and Extending Features

### Adding New Annotation Types:

1. **Create new include template** in `_includes/`
2. **Add CSS styling** to `assets/sidenotes.css`
3. **Add JavaScript behavior** to `assets/sidenotes.js` if needed
4. **Update test post** in `_drafts/sidenotes-test.md`
5. **Document usage** in this file

### Modifying Responsive Behavior:

**Breakpoints** (in `assets/sidenotes.css`):
- Mobile: `@media (max-width: 760px)`
- Laptop: `@media (max-width: 1200px) and (min-width: 761px)`
- Small laptop: `@media (max-width: 1000px) and (min-width: 761px)`

**Key CSS Properties to Adjust**:
- `margin-right`: Controls how far into margin notes extend
- `width`: Controls sidenote width
- `max-width`: Prevents overflow on smaller screens
- `padding-right`: Controls spacing from viewport edge

### Adding New Styling:

1. **Global styles**: Add to `assets/main.scss`
2. **Annotation styles**: Add to `assets/sidenotes.css`
3. **Import order**: Ensure imports in `assets/main.scss` maintain precedence

## Dependencies and Configuration

### Ruby Gems (Gemfile):
- `jekyll ~> 3.8.5`: Static site generator
- `minima ~> 2.0`: Base theme
- `jekyll-feed`: RSS feed generation
- `jekyll-gist`: GitHub gist embedding
- `webrick ~> 1.7`: Development server
- `kramdown ~> 1.14`: Markdown processor
- `rouge ~> 3.0`: Syntax highlighting

### Jekyll Configuration (_config.yml):
- **Markdown**: Kramdown with GitHub Flavored Markdown
- **Syntax highlighting**: Rouge with Monokai theme
- **Plugins**: jekyll-feed, jekyll-gist
- **Theme**: Minima (with custom overrides)

## Troubleshooting

### Common Issues:

**Liquid Template Errors**:
- Ensure include templates have minimal Liquid logic
- Use simple templates without complex conditionals
- Check for proper quote escaping in include parameters

**Sidenotes Not Positioning**:
- Verify JavaScript is loading (`_layouts/default.html`)
- Check CSS import in `assets/main.scss`
- Ensure unique IDs for each sidenote

**Mobile Layout Breaking**:
- Check responsive CSS in `assets/sidenotes.css`
- Verify mobile styles reset desktop properties
- Test with browser dev tools at various widths

**Footnote URLs Not Working**:
- Verify JavaScript event listeners are attached
- Check that footnote IDs match between reference and footnote
- Ensure smooth scrolling doesn't interfere with navigation

**Syntax Highlighting Not Working**:
- Check that Prism.js CSS/JS are loading from CDN
- Verify language identifier is correct (e.g., `cpp` not `c++`)
- Ensure code blocks use triple backticks, not Jekyll highlight tags
- Check browser console for JavaScript errors
- Verify `_config.yml` has Rouge disabled with `syntax_highlighter_opts: disable: true`

### Build Errors:

**Jekyll Build Failures**:
- Check `_config.yml` syntax
- Verify all include files exist
- Check for invalid front matter in posts

**Bundle Install Issues**:
- Update Ruby version if needed
- Clear bundle cache: `bundle clean`
- Regenerate lock file: `rm Gemfile.lock && bundle install`

## File Relationships

### Critical Dependencies:
- `_layouts/default.html` → loads `assets/sidenotes.js` and Prism.js from CDN
- `_includes/head.html` → loads Prism.js CSS from CDN
- `assets/main.scss` → imports `assets/sidenotes.css`
- All annotation includes depend on CSS classes in `sidenotes.css`
- JavaScript positioning depends on specific CSS class structure
- Prism.js autoloader handles language-specific highlighting dynamically

### Safe to Modify:
- Individual post content
- `assets/main.scss` custom styles (below imports)
- `_includes/analytics.html`
- Image files in `assets/img/`

### Modify with Caution:
- `assets/sidenotes.css` (affects all annotation positioning)
- `assets/sidenotes.js` (affects annotation behavior)
- `_layouts/default.html` (affects entire site, loads Prism.js)
- `_includes/head.html` (affects site-wide CSS loading, includes Prism.js)
- `_config.yml` (affects Jekyll build process, syntax highlighting configuration)

## Performance Considerations

- **CSS**: Sidenotes CSS + Prism.js CSS loaded from CDN, responsive without JavaScript dependency  
- **JavaScript**: Sidenotes JS loads on all pages, Prism.js autoloader only loads needed languages
- **Syntax Highlighting**: Prism.js core is only 2KB, language definitions are ~300-500 bytes each
- **CDN Benefits**: Prism.js served from cdnjs with browser caching and global distribution
- **Images**: Organized by topic, use appropriate formats and sizes
- **Build time**: Keep `_site/` in `.gitignore`, only commit source files

This documentation should be updated whenever new features are added or the architecture changes significantly.