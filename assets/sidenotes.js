/*
 * Sidenotes JavaScript
 * Handles positioning and overlap detection for sidenotes
 * Ensures sidenotes don't overlap on the page
 */

(function() {
    'use strict';

    // Initialize sidenotes when DOM is ready
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
        document.addEventListener('DOMContentLoaded', initSidenotes);
    } else {
        initSidenotes();
    }

})();