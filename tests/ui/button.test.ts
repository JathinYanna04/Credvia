import React from "react";
import Link from "next/link";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders a single slotted child without crashing", () => {
    expect(() =>
      renderToStaticMarkup(
        React.createElement(
          Button,
          { asChild: true },
          React.createElement(
            Link,
            { href: "/feed" },
            React.createElement("span", null, "Feed"),
          ),
        ),
      ),
    ).not.toThrow();
  });

  it("does not inject an extra sibling spinner in asChild mode while loading", () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        Button,
        { asChild: true, loading: true },
        React.createElement(
          Link,
          { href: "/login" },
          React.createElement("span", null, "Sign in"),
        ),
      ),
    );

    expect(markup).toContain("Sign in");
    expect(markup).not.toContain("animate-spin");
  });

  it("renders the loading spinner for a normal button", () => {
    const markup = renderToStaticMarkup(
      React.createElement(Button, { loading: true }, "Save"),
    );

    expect(markup).toContain("animate-spin");
    expect(markup).toContain("Save");
  });

  it("throws clearly for invalid asChild text-only usage", () => {
    expect(() =>
      renderToStaticMarkup(
        React.createElement(Button, { asChild: true }, "Broken child" as never),
      ),
    ).toThrow();
  });
});
