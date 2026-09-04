"use client";

import { useEffect } from "react";

export default function ArticleAdminLogin() {
  useEffect(() => {
    window.location.replace("/?view=analysis");
  }, []);

  return null;
}
