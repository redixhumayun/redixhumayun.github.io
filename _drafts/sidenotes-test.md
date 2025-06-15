---
layout: post
title: "Testing Sidenotes and Footnotes Implementation"
category: test
---

This post demonstrates the sidenotes and footnotes functionality that has been added to the blog. These features provide elegant ways to add additional context or commentary without breaking the flow of the main text.

## Basic Sidenote Usage

Here's a simple example of a sidenote{% include sidenote.html id="sn-1" text="This is a sidenote! It appears in the margin on desktop and can be expanded on mobile." %} that appears in the margin. The sidenote should be numbered and positioned appropriately.

## Multiple Sidenotes

We can have multiple sidenotes{% include sidenote.html id="sn-2" text="This is the first sidenote in this section." %} in the same paragraph or section{% include sidenote.html id="sn-3" text="And this is the second sidenote. The JavaScript should handle positioning to avoid overlaps." %}. The system should automatically handle positioning to prevent overlaps.

## Marginnotes (Unnumbered)

Sometimes you want to add a note without numbering{% include marginnote.html id="mn-1" text="This is a marginnote - it appears in the margin but doesn't have a number." %}. That's what marginnotes are for.

## Footnotes Usage

Footnotes{% include footnote.html id="1" %} are different from sidenotes. They appear at the bottom of the page{% include footnote.html id="2" %} and are perfect for citations, references, or lengthy explanations that would be distracting in the margin{% include footnote.html id="3" %}.

### Footnote URL Navigation

Footnotes support full URL navigation{% include footnote.html id="4" %}:
- **Clickable links**: Each footnote reference and back-reference changes the URL hash
- **Shareable URLs**: You can copy URLs like `#fn:1` to link directly to specific footnotes  
- **Browser navigation**: The back button works to return to where you clicked the footnote link
- **Direct access**: Load a page with `#fn:2` to jump straight to footnote 2

## Code Examples

Here's how to use sidenotes and footnotes in your Jekyll posts:

```markdown
{% raw %}
<!-- For numbered sidenotes -->
{% include sidenote.html id="unique-id" text="Your sidenote text here" %}

<!-- For unnumbered marginnotes -->
{% include marginnote.html id="unique-id" text="Your margin note text here" %}

<!-- For footnotes (references) -->
{% include footnote.html id="1" %}

<!-- Footnotes container at end of post -->
{% assign footnotes = "First footnote text|Second footnote text" | split: "|" %}
{% include footnotes.html notes=footnotes %}
{% endraw %}
```

## Mobile Behavior

On mobile devices{% include sidenote.html id="sn-4" text="On mobile, sidenotes are hidden by default and can be expanded by tapping the sidenote number or the ⊕ symbol for marginnotes." %}, the sidenotes work differently. They're collapsed by default and can be expanded by tapping the numbered link or the ⊕ symbol.

## Testing Multiple Sidenotes

Let's test multiple sidenotes{% include sidenote.html id="sn-5" text="Sidenote 1: This should appear first." %} in quick succession{% include sidenote.html id="sn-6" text="Sidenote 2: This should appear below the first one without overlapping." %} to ensure{% include sidenote.html id="sn-7" text="Sidenote 3: And this is the third sidenote, positioned below the previous ones." %} the positioning algorithm works correctly.

## Conclusion

The sidenotes and footnotes implementation provides clean, elegant ways to add supplementary information{% include sidenote.html id="sn-8" text="This implementation is based on the Tufte CSS approach and Gwern.net's sidenote system." %} to blog posts without disrupting the reading flow.

Both systems work together harmoniously{% include footnote.html id="5" %}, allowing you to choose the best presentation method for different types of supplementary content.

<!-- Footnotes section -->
{% assign footnotes = "Footnotes are traditional references that appear at the bottom of the page with numbered citations.|This allows for longer explanations, citations, or references that might be too lengthy for margin notes.|Perfect for academic writing, citations, or detailed technical explanations that would clutter the margin.|Footnotes support full URL navigation with hash changes, browser back button support, and shareable links. Try clicking this footnote number and notice how the URL changes!|Sidenotes and footnotes can be used together in the same document, each serving their specific purpose for different types of supplementary content." | split: "|" %}
{% include footnotes.html notes=footnotes %}