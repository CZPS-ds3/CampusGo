"""Unit tests of the scoring and ranking rules with an independent Python reference (integers only)."""

import pytest


def ceil_div(a, b):
    """Integer ceiling division, no floating point (R-02)."""
    return -(-a // b)


def team_score(totals):
    """BR43: average of the members' totals, rounded up to the next whole number."""
    return ceil_div(sum(totals), len(totals)) if totals else 0


def attempt_points(correct, hard_correct, remaining_s, attempt_number, count):
    """BR14 to BR21: base points, time bonus, full-clear bonus, then the attempt multiplier, rounded up."""
    multipliers = [100, 85, 70, 55, 40, 0]
    base = correct * 1000 + hard_correct * 2000
    full_clear = 200 if correct + hard_correct == count else 0
    percent = multipliers[min(attempt_number, 6) - 1]
    return ceil_div((base + remaining_s + full_clear) * percent, 100)


def competition_ranks(points):
    """Equal scores share a rank; the next rank skips (R-52)."""
    return [1 + sum(other > p for other in points) for p in points]


@pytest.mark.parametrize(
    "totals, expected",
    [
        ([1000, 1000, 1001], 1001),
        ([1001, 0, 0, 0, 0], 201),
        ([1000, 0, 0, 0, 0], 200),
        ([5], 5),
        ([0, 0], 0),
        ([], 0),
    ],
)
def test_team_score_is_the_average_rounded_up(totals, expected):
    assert team_score(totals) == expected


@pytest.mark.parametrize(
    "args, expected",
    [
        ((5, 0, 40, 1, 5), 5000 + 40 + 200),
        ((5, 0, 40, 2, 5), -(-(5240 * 85) // 100)),
        ((4, 0, 10, 1, 5), 4010),
        ((3, 0, 30, 3, 3), -(-(3230 * 70) // 100)),
        ((5, 0, 40, 6, 5), 0),
    ],
)
def test_attempt_points_follow_the_documented_formula(args, expected):
    assert attempt_points(*args) == expected


def test_a_hard_fifth_question_is_worth_two_thousand():
    assert attempt_points(4, 1, 0, 1, 5) == 4000 + 2000 + 200


def test_equal_scores_share_a_rank():
    assert competition_ranks([300, 200, 200, 100]) == [1, 2, 2, 4]


def test_the_multiplier_never_goes_below_zero_after_attempt_six():
    assert attempt_points(5, 0, 50, 9, 5) == 0
