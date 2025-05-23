'use strict';
(() => {
  var c = class {
    constructor(e) {
      (this.baseUrl = e.baseUrl),
        (this.headers = {
          'Content-Type': 'application/json',
          ...e.defaultHeaders,
        }),
        (this.maxRetries = e.maxRetries ?? 3),
        (this.initialRetryDelay = e.initialRetryDelay ?? 500);
    }
    async resolveHeaders() {
      let e = {};
      for (let [t, r] of Object.entries(this.headers)) {
        let i = await r;
        i !== null && (e[t] = i);
      }
      return e;
    }
    addHeader(e, t) {
      this.headers[e] = t;
    }
    async post(e, t, r, i) {
      try {
        let n = await fetch(e, {
          method: 'POST',
          headers: await this.resolveHeaders(),
          body: JSON.stringify(t ?? {}),
          keepalive: !0,
          ...r,
        });
        if (n.status === 401) return null;
        if (n.status !== 200 && n.status !== 202)
          throw new Error(`HTTP error! status: ${n.status}`);
        let s = await n.text();
        return s ? JSON.parse(s) : null;
      } catch (n) {
        if (i < this.maxRetries) {
          let s = this.initialRetryDelay * 2 ** i;
          return (
            await new Promise((o) => setTimeout(o, s)),
            this.post(e, t, r, i + 1)
          );
        }
        return console.error('Max retries reached:', n), null;
      }
    }
    async fetch(e, t, r = {}) {
      let i = `${this.baseUrl}${e}`;
      return this.post(i, t, r, 0);
    }
  };
  var l = class {
    constructor(e) {
      this.options = e;
      this.queue = [];
      let t = { 'openpanel-client-id': e.clientId };
      e.clientSecret && (t['openpanel-client-secret'] = e.clientSecret),
        (t['openpanel-sdk-name'] = e.sdk || 'node'),
        (t['openpanel-sdk-version'] = e.sdkVersion || process.env.SDK_VERSION),
        (this.api = new c({
          baseUrl: e.apiUrl || 'https://api.openpanel.dev',
          defaultHeaders: t,
        }));
    }
    init() {}
    ready() {
      (this.options.waitForProfile = !1), this.flush();
    }
    async send(e) {
      return this.options.disabled ||
        (this.options.filter && !this.options.filter(e))
        ? Promise.resolve()
        : this.options.waitForProfile && !this.profileId
          ? (this.queue.push(e), Promise.resolve())
          : this.api.fetch('/track', e);
    }
    setGlobalProperties(e) {
      this.global = { ...this.global, ...e };
    }
    async track(e, t) {
      return this.send({
        type: 'track',
        payload: {
          name: e,
          profileId: t?.profileId ?? this.profileId,
          properties: { ...(this.global ?? {}), ...(t ?? {}) },
        },
      });
    }
    async identify(e) {
      if (
        (e.profileId && ((this.profileId = e.profileId), this.flush()),
        Object.keys(e).length > 1)
      )
        return this.send({
          type: 'identify',
          payload: { ...e, properties: { ...this.global, ...e.properties } },
        });
    }
    async alias(e) {
      return this.send({ type: 'alias', payload: e });
    }
    async increment(e) {
      return this.send({ type: 'increment', payload: e });
    }
    async decrement(e) {
      return this.send({ type: 'decrement', payload: e });
    }
    clear() {
      this.profileId = void 0;
    }
    flush() {
      this.queue.forEach((e) => {
        this.send({
          ...e,
          payload: {
            ...e.payload,
            profileId: e.payload.profileId ?? this.profileId,
          },
        });
      }),
        (this.queue = []);
    }
  };
  function h(a) {
    return a.replace(/([-_][a-z])/gi, (e) =>
      e.toUpperCase().replace('-', '').replace('_', '')
    );
  }
  var d = class extends l {
    constructor(t) {
      super({ sdk: 'web', sdkVersion: '1.0.1', ...t });
      this.options = t;
      this.lastPath = '';
      this.isServer() ||
        (this.setGlobalProperties({ __referrer: document.referrer }),
        this.options.trackScreenViews &&
          (this.trackScreenViews(), setTimeout(() => this.screenView(), 0)),
        this.options.trackOutgoingLinks && this.trackOutgoingLinks(),
        this.options.trackAttributes && this.trackAttributes());
    }
    debounce(t, r) {
      clearTimeout(this.debounceTimer), (this.debounceTimer = setTimeout(t, r));
    }
    isServer() {
      return typeof document > 'u';
    }
    trackOutgoingLinks() {
      this.isServer() ||
        document.addEventListener('click', (t) => {
          let r = t.target,
            i = r.closest('a');
          if (i && r) {
            let n = i.getAttribute('href');
            n?.startsWith('http') &&
              super.track('link_out', {
                href: n,
                text:
                  i.innerText ||
                  i.getAttribute('title') ||
                  r.getAttribute('alt') ||
                  r.getAttribute('title'),
              });
          }
        });
    }
    trackScreenViews() {
      if (this.isServer()) return;
      let t = history.pushState;
      history.pushState = function (...s) {
        let o = t.apply(this, s);
        return (
          window.dispatchEvent(new Event('pushstate')),
          window.dispatchEvent(new Event('locationchange')),
          o
        );
      };
      let r = history.replaceState;
      (history.replaceState = function (...s) {
        let o = r.apply(this, s);
        return (
          window.dispatchEvent(new Event('replacestate')),
          window.dispatchEvent(new Event('locationchange')),
          o
        );
      }),
        window.addEventListener('popstate', () => {
          window.dispatchEvent(new Event('locationchange'));
        });
      let i = () => this.debounce(() => this.screenView(), 50);
      this.options.trackHashChanges
        ? window.addEventListener('hashchange', i)
        : window.addEventListener('locationchange', i);
    }
    trackAttributes() {
      this.isServer() ||
        document.addEventListener('click', (t) => {
          let r = t.target,
            i = r.closest('button'),
            n = r.closest('a'),
            s = i?.getAttribute('data-track')
              ? i
              : n?.getAttribute('data-track')
                ? n
                : null;
          if (s) {
            let o = {};
            for (let p of s.attributes)
              p.name.startsWith('data-') &&
                p.name !== 'data-track' &&
                (o[h(p.name.replace(/^data-/, ''))] = p.value);
            let u = s.getAttribute('data-track');
            u && super.track(u, o);
          }
        });
    }
    screenView(t, r) {
      if (this.isServer()) return;
      let i, n;
      typeof t == 'string'
        ? ((i = t), (n = r))
        : ((i = window.location.href), (n = t)),
        this.lastPath !== i &&
          ((this.lastPath = i),
          super.track('screen_view', {
            ...(n ?? {}),
            __path: i,
            __title: document.title,
          }));
    }
  };
  ((a) => {
    if (a.op && 'q' in a.op) {
      let e = a.op.q || [],
        t = new d(e.shift()[1]);
      e.forEach((r) => {
        r[0] in t && t[r[0]](...r.slice(1));
      }),
        (a.op = (r, ...i) => {
          let n = t[r] ? t[r].bind(t) : void 0;
          typeof n == 'function'
            ? n(...i)
            : console.warn(`OpenPanel: ${r} is not a function`);
        }),
        (a.openpanel = t);
    }
  })(window);
})();
