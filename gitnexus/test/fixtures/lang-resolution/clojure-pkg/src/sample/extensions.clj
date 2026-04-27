(ns sample.extensions
  (:require [sample.core :as c]))

;; Demonstrates the "free-floating" heritage forms: the IMPLEMENTS edges
;; declared here cross file boundaries — neither IShape (defprotocol) nor
;; Square (defrecord) need to live in this file for the heritage processor
;; to wire up the trait-impl edges.

(defrecord Square [side])

(extend-protocol c/IShape
  Square
  (area [_] (* (:side _) (:side _))))

(extend-type Square
  Object
  (toString [_] "a square"))
