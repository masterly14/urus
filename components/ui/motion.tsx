"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ReactNode, useContext } from "react";
import { GlobalLoaderContext } from "@/components/loading/global-loader-provider";

export function FadeIn({ 
  children, 
  className, 
  delay = 0 
}: { 
  children: ReactNode; 
  className?: string; 
  delay?: number 
}) {
  const context = useContext(GlobalLoaderContext);
  const isOverlayVisible = context?.isOverlayVisible ?? false;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: isOverlayVisible ? 0 : 1, y: isOverlayVisible ? 12 : 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.2, ease: "easeOut", delay: isOverlayVisible ? 0 : delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function Fade({ 
  children, 
  className 
}: { 
  children: ReactNode; 
  className?: string 
}) {
  const context = useContext(GlobalLoaderContext);
  const isOverlayVisible = context?.isOverlayVisible ?? false;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: isOverlayVisible ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15, ease: "easeInOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export { AnimatePresence, motion };
