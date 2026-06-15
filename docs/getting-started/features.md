# Features

Discover all the features of the Vue DevTools.

If you are using Vite plugin, you can open or close Vue DevTools with `Shift+Alt+D` or `Shift+Option+D` shortcut.

## Overview

Shows a quick overview of your app, including the Vue version, pages and components.

![overview](/features/overview.png)

## Pages

Pages tab shows your current routes with some useful information, and provides a quick way to navigate between pages. You can also use the textbox to see how each route is matched.

![pages](/features/pages.png)

## Components

Components tab shows your components information, including the node tree, state and so on. And provides some interactive features, e.g. edit state, scroll to component, etc.

![components](/features/components.png)

## Timeline

Timeline tab shows the performance of your app, including the time spent on rendering, updating, and so on.

![timeline](/features/timeline.png)

## Assets（Vite only）

Assets tab shows your files from the project directory, you can see the information of selected file with some helpful actions.

![assets](/features/assets.png)

## Router

Router tab is a feature integrated with [vue-router](https://github.com/vuejs/router), allowing you to view the routes list and its details.

![router](/features/router.png)

## Pinia

Pinia tab is a feature integrated with [pinia](https://github.com/vuejs/pinia), allowing you to view the store list and its details, and edit the state.

![pinia](/features/pinia.png)

## Graph

Graph tab shows the relationship between modules.

![graph](/features/graph.png)

## Settings

Settings tab provides some options to customize the DevTools. Here you can manage the Tab bar, enable or disable some features, and hide Vue Devtools.

![settings](/features/settings.png)

## Inspect（Vite only）

Inspect expose the [vite-plugin-inspect](https://github.com/antfu/vite-plugin-inspect) integration, allowing you to inspect transformation steps of Vite.

![inspect](/features/inspect.png)

## Inspector（Vite only）

Inspector expose the [vite-plugin-vue-inspector](https://github.com/webfansplz/vite-plugin-vue-inspector) integration, you can inspect your app's DOM tree and see which component is rendering it. Finding the place to make changes are much easier. You can active it with `Ctrl+Shift` or `Cmd+Shift` shortcut. When activated, you can use `Esc` shortcut to exit. You can customize shortcut by [`Options.componentInspector.toggleComboKey`](/guide/vite-plugin#options)

![inspector](/features/inspector.png)

## Separate Window（Vite only）

Vue DevTools is able to run as a separate window, it's so helpful when you want to debug your app in a small screen.

![separate-window](/features/separate-window.png)

## Command Palette

Command Palette is a quick way to access some useful features of the DevTools such as easy navigation, run commands and Vue Documentations. You can open it with `Ctrl+K` or `Cmd+K` shortcut.

![command-palette](/features/command-palette.png)

## Multiple Apps Support

If your app uses multiple Vue instances, you can switch between them in the top left corner of the DevTools.

![multiple-apps](/features/multi-app.png)

## Split Screen

Split Screen is a useful feature to use multiple tabs at the same time. You can open it from Command Palette or by clicking the `Vue Icon` in the top left corner of the DevTools and activate it from there.

![split-screen](/features/split-screen.png)
