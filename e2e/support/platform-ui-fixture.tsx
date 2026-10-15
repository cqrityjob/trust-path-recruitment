// Served by Vite only from the intercepted test document; never an app route.
import React from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "../../src/i18n/context";
import { Button } from "../../src/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../src/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "../../src/components/ui/alert-dialog";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "../../src/components/ui/sheet";
import "../../src/styles.css";
const en = new URLSearchParams(location.search).get("lang") === "en";
const copy = en
  ? {
      dialog: "Open dialog",
      alert: "Open confirmation",
      sheet: "Open menu",
      title: "Review the information before continuing",
      description: "Read all the information and then return to the page.",
      cancel: "Cancel",
    }
  : {
      dialog: "Öppna dialog",
      alert: "Öppna bekräftelse",
      sheet: "Öppna meny",
      title: "Granska informationen innan du fortsätter",
      description: "Läs all information och återgå sedan till sidan.",
      cancel: "Avbryt",
    };
const paragraphs = Array.from({ length: 16 }, (_, i) => (
  <p key={i}>
    {i + 1}. {copy.description}
  </p>
));
createRoot(document.getElementById("root")!).render(
  <I18nProvider initialLang={en ? "en" : "sv"}>
    <main style={{ padding: 24, display: "grid", gap: 16, maxWidth: 600 }}>
      <h1>{copy.title}</h1>
      <Dialog>
        <DialogTrigger asChild>
          <Button>{copy.dialog}</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          {paragraphs}
        </DialogContent>
      </Dialog>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button>{copy.alert}</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
          {paragraphs}
          <AlertDialogCancel>{copy.cancel}</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>
      <Sheet>
        <SheetTrigger asChild>
          <Button>{copy.sheet}</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetTitle>{copy.title}</SheetTitle>
          <SheetDescription>{copy.description}</SheetDescription>
          {paragraphs}
          <Button>{copy.cancel}</Button>
        </SheetContent>
      </Sheet>
    </main>
  </I18nProvider>,
);
