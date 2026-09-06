import { createBrowserRouter } from "react-router";

import { HomePage } from "@/routes/home";
import { CostsPage } from "@/routes/costs";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
  },
  {
    path: "/costs",
    element: <CostsPage />,
  },
]);
