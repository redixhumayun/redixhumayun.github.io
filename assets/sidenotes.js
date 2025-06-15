/*
 * Sidenotes and Footnotes JavaScript
 * Handles positioning and overlap detection for sidenotes
 * Provides smooth scrolling for footnote links
 * Ensures sidenotes don't overlap on the page
 */

(function() {
    'use strict';

    // Initialize sidenotes and footnotes when DOM is ready
    function initSidenotesAndFootnotes() {
        initSidenotes();
        initFootnotes();
    }

    // Initialize sidenotes positioning
    function initSidenotes() {
        // Only run on desktop/tablet sizes
        if (window.innerWidth <= 760) {
            return;
        }

        const sidenotes = document.querySelectorAll('.sidenote, .marginnote');
        
        if (sidenotes.length === 0) {
            return;
        }

        // Position sidenotes and handle overlaps
        positionSidenotes(sidenotes);
        
        // Reposition on window resize
        let resizeTimer;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
                if (window.innerWidth > 760) {
                    positionSidenotes(sidenotes);
                }
            }, 250);
        });
    }

    // Initialize footnotes smooth scrolling
    function initFootnotes() {
        // Add smooth scrolling to footnote links
        const footnoteRefs = document.querySelectorAll('.footnote-ref');
        const footnoteBackrefs = document.querySelectorAll('.footnote-backref');
        
        // Handle footnote reference clicks
        footnoteRefs.forEach(function(ref) {
            ref.addEventListener('click', function(e) {
                e.preventDefault();
                const target = document.querySelector(ref.getAttribute('href'));
                if (target) {
                    smoothScrollTo(target);
                }
            });
        });
        
        // Handle footnote back-reference clicks
        footnoteBackrefs.forEach(function(backref) {
            backref.addEventListener('click', function(e) {
                e.preventDefault();
                const target = document.querySelector(backref.getAttribute('href'));
                if (target) {
                    smoothScrollTo(target);
                }
            });
        });
    }

    // Smooth scroll function
    function smoothScrollTo(target) {
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - 20;
        const startPosition = window.pageYOffset;
        const distance = targetPosition - startPosition;
        const duration = 300;
        let start = null;

        function animation(currentTime) {
            if (start === null) start = currentTime;
            const timeElapsed = currentTime - start;
            const run = ease(timeElapsed, startPosition, distance, duration);
            window.scrollTo(0, run);
            if (timeElapsed < duration) requestAnimationFrame(animation);
        }

        function ease(t, b, c, d) {
            t /= d / 2;
            if (t < 1) return c / 2 * t * t + b;
            t--;
            return -c / 2 * (t * (t - 2) - 1) + b;
        }

        requestAnimationFrame(animation);
    }

    // Position sidenotes and resolve overlaps
    function positionSidenotes(sidenotes) {
        const positioned = [];
        
        sidenotes.forEach(function(sidenote) {
            // Get the sidenote number element that triggered this sidenote
            const sidenoteNumber = findSidenoteNumber(sidenote);
            
            if (!sidenoteNumber) {
                return;
            }
            
            // Get the vertical position of the sidenote number
            const numberRect = sidenoteNumber.getBoundingClientRect();
            const numberTop = numberRect.top + window.pageYOffset;
            
            // Reset any previous positioning
            sidenote.style.marginTop = '0';
            
            // Get sidenote height
            const sidenoteRect = sidenote.getBoundingClientRect();
            const sidenoteHeight = sidenoteRect.height;
            
            // Check for overlaps with previously positioned sidenotes
            let newTop = numberTop;
            
            for (let i = 0; i < positioned.length; i++) {
                const prev = positioned[i];
                const prevBottom = prev.top + prev.height + 20; // 20px margin
                
                if (newTop < prevBottom) {
                    newTop = prevBottom;
                }
            }
            
            // Apply positioning
            const marginTop = newTop - numberTop;
            if (marginTop > 0) {
                sidenote.style.marginTop = marginTop + 'px';
            }
            
            // Record this sidenote's position
            positioned.push({
                element: sidenote,
                top: newTop,
                height: sidenoteHeight
            });
        });
    }

    // Find the sidenote number element that corresponds to a sidenote
    function findSidenoteNumber(sidenote) {
        // Look for preceding sidenote-number element
        let current = sidenote.previousElementSibling;
        
        while (current) {
            if (current.classList.contains('margin-toggle')) {
                // Skip the hidden checkbox
                current = current.previousElementSibling;
                continue;
            }
            
            if (current.classList.contains('sidenote-number')) {
                return current;
            }
            
            // If we find another sidenote, we've gone too far
            if (current.classList.contains('sidenote') || current.classList.contains('marginnote')) {
                break;
            }
            
            current = current.previousElementSibling;
        }
        
        return null;
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSidenotesAndFootnotes);
    } else {
        initSidenotesAndFootnotes();
    }

})();