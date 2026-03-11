#!/usr/bin/env python3
import boto3
import json
import sys
import argparse
from typing import List, Dict, Any

def get_jobs(data: Any) -> List[Dict]:
    """Extract list of job dicts from data (handles both single job and jobs array)"""
    if isinstance(data, dict) and 'jobs' in data:
        return [j for j in data['jobs'] if isinstance(j, dict)]
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

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description='Search for a term in JSON files stored in S3'
    )
    parser.add_argument(
        'search_term',
        help='The term to search for in the JSON files'
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

    search_json_files(args.bucket, args.prefix, args.search_term)
