---
"@marktiderman/genesis-ui": patch
---

`@marktiderman/genesis-ui/router/react-router` now accepts React Router 8 as well as 7: the optional `react-router` peer range is `^7.0.0 || ^8.0.0`. The adapters use only `Link`, `useLocation`, `useNavigate` and `useSearchParams`, which v8 keeps unchanged, and their tests run on 8.5. React Router 8 needs Node.js 22.22+ and React 19.2.7+.
