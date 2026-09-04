import { createContext, useContext } from 'react';

/**
 * What a section needs to know beyond its own content: the asset map (ids →
 * files), whether the page is the live published site (so forms post for real)
 * and, inside the builder, which section is selected.
 */
export const SiteCtx = createContext({ assets: {}, live: false, slug: null, editable: false, select: () => {}, selected: null });

export const useSite = () => useContext(SiteCtx);
