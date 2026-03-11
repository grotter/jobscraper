#!/usr/bin/env python3
import boto3
import csv
import json
import sys
import argparse
from typing import List, Dict, Any

def get_jobs(data: Any) -> List[Dict]:
    """Extract list of job dicts from data, normalized to a flat structure.

    External format: { "jobs": [ { title, id, first_published, pay_ranges_inferred, ... } ] }
    Internal format: [ { title, details: { id, first_published, pay_ranges_inferred, ... } } ]
    """
    if isinstance(data, dict) and 'jobs' in data:
        # External format
        return [j for j in data['jobs'] if isinstance(j, dict)]
    elif isinstance(data, list):
        # Internal format: merge details into top level so downstream field access is uniform
        jobs = []
        for j in data:
            if not isinstance(j, dict):
                continue
            details = j.get('details') or {}
            jobs.append({**details, 'title': j.get('title') or details.get('title', '')})
        return jobs
    elif isinstance(data, dict):
        return [data]
    return []

def search_json_files(bucket: str, prefix: str, search_term: str):
    """Search for term in job titles in all JSON files in S3 bucket"""
    s3 = boto3.client('s3')

    print(f"Searching for '{search_term}' in s3://{bucket}/{prefix}")
    print("-" * 80)

    # List all objects in the bucket with the prefix
    paginator = s3.get_paginator('list_objects_v2')
    matches_found = 0
    files_searched = 0

    try:
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            if 'Contents' not in page:
                continue

            for obj in page['Contents']:
                key = obj['Key']

                # Only process JSON files
                if not key.lower().endswith('.json'):
                    continue

                files_searched += 1

                try:
                    # Get the file content
                    response = s3.get_object(Bucket=bucket, Key=key)
                    content = response['Body'].read().decode('utf-8')

                    # Parse JSON
                    data = json.loads(content)

                    # Search titles only
                    for job in get_jobs(data):
                        title = job.get('title', '')
                        if search_term.lower() in title.lower():
                            matches_found += 1
                            print(f"✓ MATCH: {title}  (s3://{bucket}/{key})")
                            pay_ranges = job.get('pay_ranges_inferred')
                            if pay_ranges is not None:
                                print(f"  pay_ranges_inferred: {pay_ranges}")

                except json.JSONDecodeError:
                    print(f"✗ ERROR: Invalid JSON in s3://{bucket}/{key}", file=sys.stderr)
                except Exception as e:
                    print(f"✗ ERROR: Failed to process s3://{bucket}/{key}: {e}", file=sys.stderr)

    except Exception as e:
        print(f"✗ ERROR: Failed to list objects: {e}", file=sys.stderr)
        return

    print("-" * 80)
    print(f"Files searched: {files_searched}")
    print(f"Matches found: {matches_found}")

def export_csv(bucket: str, prefix: str, output_path: str):
    """Export all jobs, unique by id, to a CSV file"""
    s3 = boto3.client('s3')

    print(f"Exporting jobs from s3://{bucket}/{prefix} to {output_path}")

    seen_ids = set()
    rows = []

    paginator = s3.get_paginator('list_objects_v2')

    try:
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            if 'Contents' not in page:
                continue

            for obj in page['Contents']:
                key = obj['Key']
                if not key.lower().endswith('.json'):
                    continue

                try:
                    response = s3.get_object(Bucket=bucket, Key=key)
                    content = response['Body'].read().decode('utf-8')
                    data = json.loads(content)

                    for job in get_jobs(data):
                        job_id = job.get('id')
                        if job_id is None or job_id in seen_ids:
                            continue
                        seen_ids.add(job_id)

                        pay = (job.get('pay_ranges_inferred') or [{}])[0]
                        rows.append({
                            'date_posted': job.get('first_published', ''),
                            'job_id': job_id,
                            'title': job.get('title', ''),
                            'pay_min': pay.get('min', ''),
                            'pay_max': pay.get('max', ''),
                            'pay_period': pay.get('period', ''),
                        })

                except json.JSONDecodeError:
                    print(f"✗ ERROR: Invalid JSON in s3://{bucket}/{key}", file=sys.stderr)
                except Exception as e:
                    print(f"✗ ERROR: Failed to process s3://{bucket}/{key}: {e}", file=sys.stderr)

    except Exception as e:
        print(f"✗ ERROR: Failed to list objects: {e}", file=sys.stderr)
        return

    with open(output_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=['date_posted', 'job_id', 'title', 'pay_min', 'pay_max', 'pay_period'])
        writer.writeheader()
        writer.writerows(rows)

    print(f"Exported {len(rows)} unique jobs to {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='Search for a term in JSON files stored in S3'
    )
    parser.add_argument(
        'search_term',
        nargs='?',
        default='',
        help='The term to search for in the JSON files'
    )
    parser.add_argument(
        '--export-csv',
        metavar='OUTPUT_PATH',
        help='Export all unique jobs to a CSV file at the given path'
    )
    parser.add_argument(
        '--bucket',
        default='files.calacademy.org',
        help='S3 bucket name (default: files.calacademy.org)'
    )
    parser.add_argument(
        '--prefix',
        default='jobs/',
        help='S3 key prefix (default: jobs/)'
    )

    args = parser.parse_args()

    if args.export_csv:
        export_csv(args.bucket, args.prefix, args.export_csv)
    else:
        search_json_files(args.bucket, args.prefix, args.search_term)
