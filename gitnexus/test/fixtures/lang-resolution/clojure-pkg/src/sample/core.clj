(ns sample.core
  (:require [sample.util :as u]))

(defn caller []
  (u/double-it 21))

(defmulti describe :type)

(defmethod describe :dog [_] "A dog")
(defmethod describe :cat [_] "A cat")

(defprotocol IShape
  (area [this]))

(defrecord Circle [radius]
  IShape
  (area [_] (* 3.14 radius radius)))
