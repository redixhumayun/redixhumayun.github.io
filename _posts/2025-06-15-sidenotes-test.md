---
layout: post
title: "Testing Sidenotes Implementation"
category: test
---

This post demonstrates the sidenotes functionality that has been added to the blog. Sidenotes are a great way to add additional context or commentary without breaking the flow of the main text.

## Basic Sidenote Usage

Here's a simple example of a sidenote{% include sidenote.html id="sn-1" text="This is a sidenote! It appears in the margin on desktop and can be expanded on mobile." %} that appears in the margin. The sidenote should be numbered and positioned appropriately.

## Multiple Sidenotes

We can have multiple sidenotes{% include sidenote.html id="sn-2" text="This is the first sidenote in this section." %} in the same paragraph or section{% include sidenote.html id="sn-3" text="And this is the second sidenote. The JavaScript should handle positioning to avoid overlaps." %}. The system should automatically handle positioning to prevent overlaps.

## Marginnotes (Unnumbered)

Sometimes you want to add a note without numbering{% include marginnote.html id="mn-1" text="This is a marginnote - it appears in the margin but doesn't have a number." %}. That's what marginnotes are for.

## Code Examples

Here's how to use sidenotes in your Jekyll posts:

```markdown
{% raw %}
<!-- For numbered sidenotes -->
{% include sidenote.html text="Your sidenote text here" %}

<!-- For unnumbered marginnotes -->
{% include marginnote.html text="Your margin note text here" %}

<!-- With custom IDs -->
{% include sidenote.html id="custom-id" text="Sidenote with custom ID" %}
{% endraw %}
```

## Mobile Behavior

On mobile devices{% include sidenote.html id="sn-4" text="On mobile, sidenotes are hidden by default and can be expanded by tapping the sidenote number or the ⊕ symbol for marginnotes." %}, the sidenotes work differently. They're collapsed by default and can be expanded by tapping the numbered link or the ⊕ symbol.

## Testing Multiple Sidenotes

Let's test multiple sidenotes{% include sidenote.html id="sn-5" text="Sidenote 1: This should appear first." %} in quick succession{% include sidenote.html id="sn-6" text="Sidenote 2: This should appear below the first one without overlapping." %} to ensure{% include sidenote.html id="sn-7" text="Sidenote 3: And this is the third sidenote, positioned below the previous ones." %} the positioning algorithm works correctly.

## Conclusion

The sidenotes implementation provides a clean, elegant way to add supplementary information{% include sidenote.html id="sn-8" text="This implementation is based on the Tufte CSS approach and Gwern.net's sidenote system." %} to blog posts without disrupting the reading flow.