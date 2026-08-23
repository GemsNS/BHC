import type { StaticImageData } from "next/image";

import F031DE44 from "@/assets/jobshowcase/F031DE44-2881-42B5-886D-BD1080587853.jpg";
import IMG_0983 from "@/assets/jobshowcase/IMG_0983.jpg";
import IMG_0984 from "@/assets/jobshowcase/IMG_0984.jpg";
import IMG_1436 from "@/assets/jobshowcase/IMG_1436.jpg";
import IMG_1483 from "@/assets/jobshowcase/IMG_1483.jpg";
import IMG_1773 from "@/assets/jobshowcase/IMG_1773.jpg";
import IMG_1774 from "@/assets/jobshowcase/IMG_1774.jpg";
import IMG_1775 from "@/assets/jobshowcase/IMG_1775.jpg";
import IMG_1776 from "@/assets/jobshowcase/IMG_1776.jpg";
import IMG_1841 from "@/assets/jobshowcase/IMG_1841.jpg";
import IMG_1849 from "@/assets/jobshowcase/IMG_1849.jpg";
import IMG_1878 from "@/assets/jobshowcase/IMG_1878.jpg";
import IMG_1886 from "@/assets/jobshowcase/IMG_1886.jpg";
import IMG_1922 from "@/assets/jobshowcase/IMG_1922.jpg";
import IMG_1923 from "@/assets/jobshowcase/IMG_1923.jpg";
import IMG_2177 from "@/assets/jobshowcase/IMG_2177.jpg";
import IMG_2198 from "@/assets/jobshowcase/IMG_2198.jpg";
import IMG_2200 from "@/assets/jobshowcase/IMG_2200.jpg";
import IMG_2203 from "@/assets/jobshowcase/IMG_2203.jpg";
import IMG_2244 from "@/assets/jobshowcase/IMG_2244.jpg";
import IMG_2257 from "@/assets/jobshowcase/IMG_2257.jpg";
import IMG_2358 from "@/assets/jobshowcase/IMG_2358.jpg";
import IMG_2545 from "@/assets/jobshowcase/IMG_2545.jpg";
import IMG_2567 from "@/assets/jobshowcase/IMG_2567.jpg";
import IMG_2572 from "@/assets/jobshowcase/IMG_2572.jpg";
import IMG_2576 from "@/assets/jobshowcase/IMG_2576.jpg";
import IMG_2578 from "@/assets/jobshowcase/IMG_2578.jpg";
import IMG_2597 from "@/assets/jobshowcase/IMG_2597.jpg";
import IMG_2598 from "@/assets/jobshowcase/IMG_2598.jpg";
import IMG_2824 from "@/assets/jobshowcase/IMG_2824.jpg";
import IMG_2835 from "@/assets/jobshowcase/IMG_2835.jpg";
import IMG_2836 from "@/assets/jobshowcase/IMG_2836.jpg";
import IMG_2837 from "@/assets/jobshowcase/IMG_2837.jpg";
import IMG_2839 from "@/assets/jobshowcase/IMG_2839.jpg";
import IMG_3205 from "@/assets/jobshowcase/IMG_3205.jpg";
import IMG_3207 from "@/assets/jobshowcase/IMG_3207.jpg";
import IMG_3266 from "@/assets/jobshowcase/IMG_3266.jpg";
import IMAGE_000000 from "@/assets/jobshowcase/image000000.jpg";

/** Tag each asset for a single audience-specific gallery. */
export type JobShowcaseAudience = "residential" | "commercial";

export type JobShowcaseImage = {
  src: StaticImageData;
  alt: string;
  /** Short display headline for gallery cards (no camera filenames). */
  title: string;
  audience: JobShowcaseAudience;
};

export const JOB_SHOWCASE_IMAGES: JobShowcaseImage[] = [
  {
    src: F031DE44,
    alt: "Completed BH Contracting Co. exterior project.",
    title: "Coastal exterior renovation",
    audience: "residential",
  },
  {
    src: IMG_0983,
    alt: "Siding and trim installation completed by BH Contracting Co.",
    title: "Siding and trim package",
    audience: "commercial",
  },
  {
    src: IMG_0984,
    alt: "Mid-rise exterior work underway on a commercial multi-unit project in Halifax.",
    title: "Mid-rise envelope installation",
    audience: "commercial",
  },
  {
    src: IMG_1436,
    alt: "Commercial facade detail from a multi-unit exterior project by BH Contracting Co.",
    title: "Commercial facade detail",
    audience: "commercial",
  },
  {
    src: IMG_1483,
    alt: "Residential exterior upgrade with clean finish carpentry.",
    title: "Finish carpentry and cladding upgrade",
    audience: "residential",
  },
  {
    src: IMG_1773,
    alt: "Project showcase photo from a completed BH Contracting build.",
    title: "Completed build showcase",
    audience: "commercial",
  },
  {
    src: IMG_1774,
    alt: "Completed cladding and weatherproofing exterior work.",
    title: "Cladding and weatherproofing",
    audience: "commercial",
  },
  {
    src: IMG_1775,
    alt: "Finalized siding and trim package installation.",
    title: "Siding and trim installation",
    audience: "commercial",
  },
  {
    src: IMG_1776,
    alt: "Completed wall finish and exterior detail work.",
    title: "Wall finish and exterior details",
    audience: "commercial",
  },
  {
    src: IMG_1841,
    alt: "Finished home envelope and exterior trim project.",
    title: "Home envelope and trim",
    audience: "residential",
  },
  {
    src: IMG_1849,
    alt: "Completed door and window exterior finishing package.",
    title: "Door and window finishing",
    audience: "residential",
  },
  {
    src: IMG_1878,
    alt: "Craft-focused renovation with polished exterior details.",
    title: "Craft-focused exterior renovation",
    audience: "residential",
  },
  {
    src: IMG_1886,
    alt: "Completed residential facade upgrade by BH Contracting Co.",
    title: "Residential facade upgrade",
    audience: "residential",
  },
  {
    src: IMG_1922,
    alt: "Final project photo featuring clean lines and durable finishes.",
    title: "Clean lines and durable finishes",
    audience: "residential",
  },
  {
    src: IMG_1923,
    alt: "Exterior transformation project completed in Nova Scotia.",
    title: "Full exterior transformation",
    audience: "residential",
  },
  {
    src: IMG_2177,
    alt: "Completed coastal renovation with durable materials.",
    title: "Coastal renovation",
    audience: "residential",
  },
  {
    src: IMG_2198,
    alt: "Finished siding and trim project detail image.",
    title: "Siding and trim detail",
    audience: "residential",
  },
  {
    src: IMG_2200,
    alt: "Completed construction project with premium exterior workmanship.",
    title: "Premium exterior workmanship",
    audience: "residential",
  },
  {
    src: IMG_2203,
    alt: "Home exterior update completed by BH Contracting Co. team.",
    title: "Whole-home exterior update",
    audience: "residential",
  },
  {
    src: IMG_2244,
    alt: "Residential project completion photo showing precise detailing.",
    title: "Precise exterior detailing",
    audience: "residential",
  },
  {
    src: IMG_2257,
    alt: "Completed exterior package for a Nova Scotia residence.",
    title: "Complete exterior package",
    audience: "residential",
  },
  {
    src: IMG_2358,
    alt: "Completed project photo from BH Contracting Co. portfolio.",
    title: "Portfolio exterior completion",
    audience: "commercial",
  },
  {
    src: IMG_2545,
    alt: "Crafted exterior finish and trim work from completed build.",
    title: "Exterior finish and trim",
    audience: "residential",
  },
  {
    src: IMG_2567,
    alt: "Completed home improvement project showcasing weather-ready craftsmanship.",
    title: "Weather-ready craftsmanship",
    audience: "residential",
  },
  {
    src: IMG_2572,
    alt: "Finalized exterior renovation with modern curb appeal.",
    title: "Modern curb appeal renovation",
    audience: "residential",
  },
  {
    src: IMG_2576,
    alt: "Completed residential cladding and trim installation.",
    title: "Residential cladding and trim",
    audience: "residential",
  },
  {
    src: IMG_2578,
    alt: "Detailed finish carpentry and exterior project completion.",
    title: "Finish carpentry completion",
    audience: "residential",
  },
  {
    src: IMG_2597,
    alt: "BH Contracting Co. completed project detail image.",
    title: "Full residential siding overhaul",
    audience: "residential",
  },
  {
    src: IMG_2598,
    alt: "Completed exterior construction photo from recent job.",
    title: "Bay window and front elevation",
    audience: "residential",
  },
  {
    src: IMG_2824,
    alt: "Finished renovation showcasing durable siding and trim.",
    title: "Siding detail with service integration",
    audience: "residential",
  },
  {
    src: IMG_2835,
    alt: "Completed project with clean architectural exterior lines.",
    title: "Split-level siding and windows",
    audience: "residential",
  },
  {
    src: IMG_2836,
    alt: "Nova Scotia residential job completed by BH Contracting Co.",
    title: "Garage and bay window facade",
    audience: "residential",
  },
  {
    src: IMG_2837,
    alt: "Exterior finishing and detailing from completed home project.",
    title: "Corner siding and trim detail",
    audience: "residential",
  },
  {
    src: IMG_2839,
    alt: "Completed renovation image with high-quality finish standards.",
    title: "High-quality exterior finish",
    audience: "residential",
  },
  {
    src: IMG_3205,
    alt: "Completed BH Contracting project photo featuring custom exterior elements.",
    title: "Custom exterior elements",
    audience: "commercial",
  },
  {
    src: IMG_3207,
    alt: "Finished build with resilient materials for coastal conditions.",
    title: "Coastal-durable exterior",
    audience: "commercial",
  },
  {
    src: IMG_3266,
    alt: "Completed construction portfolio image from BH Contracting Co.",
    title: "Portfolio exterior project",
    audience: "commercial",
  },
  {
    src: IMAGE_000000,
    alt: "Completed job showcase image from BH Contracting Co.",
    title: "Completed exterior showcase",
    audience: "commercial",
  },
];
