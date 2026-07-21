// ksp-crime-analytics-platform/client/src/components/Graph/PersonSearch.jsx
//
// Autocomplete person search input with debounced fetch.
// Displays dropdown results below the input on search.

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Search } from 'lucide-react';
import { fetchDashboard } from '../../services/api';

/**
 * PersonSearch — autocomplete input for finding persons in the graph.
 *
 * @param {object} props
 * @param {(personId: string) => void} props.onSelect - Called when a result is selected
 */
export default function PersonSearch({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const doSearch = useCallback(async (searchTerm) => {
    if (!searchTerm || searchTerm.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await fetchDashboard('person-search', { searchTerm });
      const persons = Array.isArray(data) ? data : [];
      setResults(persons);
      // Open dropdown even for empty results (shows "no persons found" message)
      setOpen(true);
    } catch (err) {
      setError('Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      doSearch(value);
    }, 300);
  };

  const handleSelect = (person) => {
    setQuery(person.label || person.name || '');
    setOpen(false);
    if (onSelect) {
      onSelect(person.id || person.personId);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full max-w-sm">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
        <input
          type="text"
          placeholder="Search for a person..."
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          className="w-full rounded-md border border-border bg-input py-2 pl-10 pr-4 font-body text-sm text-foreground placeholder:text-foreground/40 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          aria-label="Search for a person"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent" />
          </div>
        )}
      </div>

      {/* Dropdown results */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-input shadow-lg">
          {results.length > 0 ? (
            <ul className="max-h-60 overflow-y-auto py-1" role="listbox">
              {results.map((person, idx) => (
                <li
                  key={person.id || person.personId || idx}
                  role="option"
                  aria-selected={false}
                  className="cursor-pointer px-3 py-2 font-body text-sm text-foreground/80 hover:bg-accent/10 hover:text-accent"
                  onMouseDown={() => handleSelect(person)}
                >
                  {person.label || person.name || 'Unknown'}
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-2 font-body text-sm text-foreground/40">
              No persons found matching &quot;{query}&quot;
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-1 px-3 py-1 text-xs text-destructive font-body" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
