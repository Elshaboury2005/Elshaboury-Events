"""
predict_service.py
Run with: python predict_service.py
Requires: flask, joblib, pandas, scikit-learn
Place event_decision_bundle.pkl in the same folder as this file.
"""
from flask import Flask, request, jsonify
import joblib
import pandas as pd

app = Flask(__name__)
bundle = joblib.load("event_decision_bundle.pkl")
clf = bundle["classifier"]
reg = bundle["regressor"]
categorical_cols = bundle["categorical_cols"]
numeric_cols = bundle["numeric_cols"]

DECISION_THRESHOLD = 0.5  # success_probability >= this -> accept


def build_reasons(row, success_prob, attendance_rate):
    """Generate human-readable reasons for the admin report."""
    reasons = []

    capacity_ratio = row["guest_count"] / max(row["hall_capacity"], 1)
    if capacity_ratio > 1.3:
        reasons.append("Guest count significantly exceeds hall capacity (overbooking risk).")
    elif capacity_ratio <= 1.1:
        reasons.append("Guest count fits well within hall capacity.")

    if row["lead_time_days"] < 5:
        reasons.append("Very short lead time before the event (high risk).")
    elif row["lead_time_days"] >= 14:
        reasons.append("Sufficient lead time for marketing and planning.")

    if row["organizer_past_events"] > 0:
        cancel_rate = row["organizer_past_cancellations"] / row["organizer_past_events"]
        if cancel_rate > 0.3:
            reasons.append("Organizer has a notable history of cancellations.")
        elif row["organizer_past_events"] >= 3:
            reasons.append("Organizer has a solid track record of past events.")
    else:
        reasons.append("First-time organizer (no history available).")

    price_ratio = row["ticket_price"] / max(row["market_avg_price"], 1)
    if price_ratio > 1.25:
        reasons.append("Ticket price is significantly above market average.")

    if row["marketing_reach_score"] >= 70:
        reasons.append("Strong marketing reach score.")
    elif row["marketing_reach_score"] < 30:
        reasons.append("Low marketing reach score, may affect turnout.")

    if not reasons:
        reasons.append("No strong risk or strength factors detected; decision based on overall model score.")

    return reasons


@app.route("/predict", methods=["POST"])
def predict():
    data = request.json
    row = pd.Series(data)
    X = pd.DataFrame([data])[categorical_cols + numeric_cols]

    success_prob = float(clf.predict_proba(X)[0][1])
    attendance_rate = float(reg.predict(X)[0])
    decision = "accepted" if success_prob >= DECISION_THRESHOLD else "rejected"
    reasons = build_reasons(row, success_prob, attendance_rate)

    report = {
        "decision": decision,
        "success_probability": round(success_prob, 3),
        "expected_attendance_rate": round(attendance_rate, 3),
        "expected_visitor_count": round(attendance_rate * data["guest_count"], 1),
        "reasons": reasons,
        "input_summary": data,
    }
    return jsonify(report)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(port=5050)
