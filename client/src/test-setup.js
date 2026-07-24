import '@testing-library/jest-dom'

// Polyfill scrollIntoView for jsdom (used by ChatArea useEffect)
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {}
}
