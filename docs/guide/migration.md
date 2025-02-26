# Migration Guide

:::tip Compatibility Note
The v7 version of devtools only supports Vue3. If your application is still using Vue2, please install the [v6 version](https://chromewebstore.google.com/detail/vuejs-devtools/iaajmlceplecbljialhhkmedjlpdblhp?utm_source=ext_sidebar?utm_source=ext_sidebar). If you're still using v5 version, you can install it [here](https://chromewebstore.google.com/detail/vuejs-devtools-v5/hkddcnbhifppgmfgflgaelippbigjpjo).
:::

## Features Improvements

In v7, we've made some feature-level adjustments compared to v6. You can view the v7 feature overview in the [Features](/getting-started/features). Here, we mainly mention some of the main feature changes.

### Feature Adjustments

- Plugin Timeline Tab

In v7, we moved the plugin timeline tab to be managed within each plugin's menu. Here is a screenshot of the pinia devtools plugin:

![pinia-timeline](/features/pinia-timeline.png)

## Plugin API

In v7, we are fully compatible with the v6 plugin API (Except type). You can check out the [v6 Plugin API documentation](https://devtools-v6.vuejs.org/plugin/api-reference.html) here.

Additionally, we have introduced some new plugin APIs. You can find more details [here](/plugins/api).
